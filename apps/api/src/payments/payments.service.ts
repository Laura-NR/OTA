import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import type { TenantConfig } from '@ota/config';
import type { PaymentReceipt, Reservation } from '@ota/db';
import {
  ReservationStatus,
  buildSchedule,
  cardFee,
  type ScheduledInstalment,
} from '@ota/domain';
import type { PaymentProvider, PaymentRail } from '@ota/payments';
import type {
  CreatePaymentIntentRequest,
  PaymentIntentDto,
  PaymentIntentLookupDto,
  PaymentLedgerEntryDto,
  PaymentLedgerQuery,
  PaymentReceiptDto,
  ReservationDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { loadOfacGate } from '../compliance/ofac-gate';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from '../reservations/reservations.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';
import { depositPolicyFor } from './payment-terms';
import { PAYMENT_PROVIDERS } from './payments.tokens';

/** Statuses in which a first payment link may be created (spec §7.1). */
const FIRST_LINK_STATUSES: readonly string[] = [
  ReservationStatus.SecuredAndInvoiced,
  ReservationStatus.PendingPayment,
];

/** Once a schedule exists, a later instalment (the balance) is paid from these too. */
const LATER_LINK_STATUSES: readonly string[] = [
  ...FIRST_LINK_STATUSES,
  ReservationStatus.Confirmed,
  ReservationStatus.InProgress,
];

function toReservationDto(reservation: Reservation): ReservationDto {
  return {
    id: reservation.id,
    bookingCode: reservation.bookingCode,
    status: reservation.status as ReservationStatus,
    tourismCategory: reservation.tourismCategory,
    startDate: reservation.startDate.toISOString(),
    endDate: reservation.endDate.toISOString(),
    totalCurrency: reservation.totalCurrency,
    totalAmount: reservation.totalAmount.toString(),
    createdAt: reservation.createdAt.toISOString(),
  };
}

export function toReceiptDto(receipt: PaymentReceipt): PaymentReceiptDto {
  return {
    id: receipt.id,
    reservationId: receipt.reservationId,
    rail: receipt.rail,
    amount: receipt.amount.toString(),
    feeAmount: receipt.feeAmount.toString(),
    instalmentId: receipt.instalmentId,
    currency: receipt.currency,
    status: receipt.status,
    createdAt: receipt.createdAt.toISOString(),
  };
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
    @Inject(PAYMENT_PROVIDERS)
    private readonly providers: Record<PaymentRail, PaymentProvider>,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
  ) {}

  async list(reservationId: string): Promise<PaymentReceiptDto[]> {
    await this.requireReservation(reservationId);

    const receipts = await this.prisma.paymentReceipt.findMany({
      where: { reservationId },
      orderBy: { createdAt: 'desc' },
    });
    return receipts.map(toReceiptDto);
  }

  /** Receipts across every booking, newest first, for the operations ledger. */
  async ledger(query: PaymentLedgerQuery): Promise<PaymentLedgerEntryDto[]> {
    const receipts = await this.prisma.paymentReceipt.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      include: { reservation: { select: { bookingCode: true } } },
    });
    return receipts.map((receipt) => ({
      ...toReceiptDto(receipt),
      bookingCode: receipt.reservation.bookingCode,
      updatedAt: receipt.updatedAt.toISOString(),
    }));
  }

  /**
   * Minimal public lookup for the wire-instructions page, keyed by the
   * unguessable provider reference (capability URL). Deliberately returns no
   * traveler PII — just the booking reference, amount, rail, and status.
   */
  async lookupIntent(reference: string): Promise<PaymentIntentLookupDto> {
    const receipt = await this.prisma.paymentReceipt.findFirst({
      where: { gatewayTxId: reference },
      include: { reservation: { select: { bookingCode: true } } },
    });
    if (!receipt) {
      throw new NotFoundException('Payment intent not found');
    }
    return {
      reference: receipt.reservation.bookingCode,
      rail: receipt.rail,
      amount: receipt.amount.toString(),
      currency: receipt.currency,
      status: receipt.status,
    };
  }

  /**
   * Generate a payment link for the next instalment (spec §7.1, M4). The first
   * link fixes the plan: the full amount, or a deposit and a balance when the
   * package's deposit plan allows it (M4 D1–D2); creating it moves
   * SECURED_AND_INVOICED -> PENDING_PAYMENT. Later links pay the instalment
   * still due, the balance included once the booking is confirmed. A card
   * payment carries the manifest's card fee on top (M4 D6).
   */
  async createIntent(
    reservationId: string,
    input: CreatePaymentIntentRequest,
    actor: AuthUser,
  ): Promise<PaymentIntentDto> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        instalments: { orderBy: { position: 'asc' } },
        package: { select: { depositPolicy: true } },
      },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }
    const status = reservation.status as ReservationStatus;
    const scheduled = reservation.instalments.length > 0;
    if (!(scheduled ? LATER_LINK_STATUSES : FIRST_LINK_STATUSES).includes(status)) {
      throw new ConflictException(
        'A payment link can only be created once the booking is secured and invoiced',
      );
    }
    const due = reservation.instalments.find((instalment) => instalment.status === 'DUE');
    if (scheduled && !due) {
      throw new ConflictException('Nothing is due on this booking');
    }
    // M3 D3: every US person on the booking must have certified first.
    const gate = await loadOfacGate(this.prisma, reservationId);
    if (gate.missing.length > 0) {
      throw new ConflictException(
        `Payment stays locked until ${gate.missing.length} US traveler(s) complete the OFAC travel-category certification`,
      );
    }

    let schedule: ScheduledInstalment[] | null = null;
    const plan = input.plan ?? 'FULL';
    const policyKey = reservation.package?.depositPolicy ?? null;
    if (!scheduled) {
      schedule = buildSchedule({
        total: Number(reservation.totalAmount),
        plan,
        policy: depositPolicyFor(this.tenant, policyKey),
        departure: reservation.startDate,
        now: new Date(),
        windowHours: this.tenant.payments.windowHours,
      });
      if (!schedule) {
        throw new ConflictException(
          'A deposit is not offered on this booking: pay the full amount',
        );
      }
    }
    const instalmentIds = (schedule ?? []).map(() => randomUUID());
    const instalmentId = due?.id ?? instalmentIds[0]!;
    const amount = Number(due?.amount ?? schedule![0]!.amount);
    const kind = due?.kind ?? schedule![0]!.kind;
    const fee =
      input.rail === 'CARD' ? cardFee(amount, this.tenant.payments.cardFeePercent) : 0;

    const intent = await this.providers[input.rail].createIntent({
      reference: reservation.bookingCode,
      amount: amount + fee,
      currency: reservation.totalCurrency,
      rail: input.rail,
    });

    const receipt = await this.prisma.$transaction(async (tx) => {
      if (schedule) {
        await tx.paymentInstalment.createMany({
          data: schedule.map((instalment, position) => ({
            id: instalmentIds[position]!,
            reservationId,
            kind: instalment.kind,
            position,
            amount: instalment.amount,
            currency: reservation.totalCurrency,
            dueAt: instalment.dueAt,
            policyKey: plan === 'DEPOSIT' ? policyKey : null,
          })),
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'payment.schedule_created',
            entityType: 'Reservation',
            entityId: reservationId,
            metadata: {
              plan,
              policyKey: plan === 'DEPOSIT' ? policyKey : null,
              instalments: schedule.map((instalment) => ({
                kind: instalment.kind,
                amount: instalment.amount.toFixed(2),
                dueAt: instalment.dueAt.toISOString(),
              })),
            },
          },
        });
      }

      const created = await tx.paymentReceipt.create({
        data: {
          reservationId,
          instalmentId,
          gatewayTxId: intent.providerReference,
          rail: input.rail,
          currency: reservation.totalCurrency,
          amount,
          feeAmount: fee,
          status: 'PENDING',
        },
      });

      if (status === ReservationStatus.SecuredAndInvoiced) {
        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: ReservationStatus.PendingPayment },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'reservation.transition',
            entityType: 'Reservation',
            entityId: reservationId,
            metadata: {
              from: status,
              to: ReservationStatus.PendingPayment,
              reason: 'payment link created',
            },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'payment.intent_created',
          entityType: 'PaymentReceipt',
          entityId: created.id,
          metadata: {
            rail: input.rail,
            instalment: kind,
            amount: amount.toFixed(2),
            fee: fee.toFixed(2),
            currency: reservation.totalCurrency,
          },
        },
      });

      return created;
    });

    return { ...toReceiptDto(receipt), checkoutUrl: intent.checkoutUrl };
  }

  /**
   * Apply a gateway callback to a pending receipt. Until a real provider with
   * signed webhooks is wired (ADR 0003), only an authenticated operations user
   * can confirm. On PAID the receipt's instalment is paid, and the first
   * payment moves the booking to CONFIRMED, which issues documents.
   */
  async confirm(
    reservationId: string,
    paymentId: string,
    actor: AuthUser,
  ): Promise<ReservationDto> {
    const receipt = await this.prisma.paymentReceipt.findUnique({
      where: { id: paymentId },
    });
    if (!receipt || receipt.reservationId !== reservationId) {
      throw new NotFoundException('Payment not found for this reservation');
    }
    if (receipt.status !== 'PENDING') {
      throw new ConflictException(`Payment is already ${receipt.status}`);
    }
    if (!receipt.gatewayTxId) {
      throw new BadRequestException('Payment has no gateway reference');
    }

    const event = this.providers[receipt.rail].parseWebhook({
      providerReference: receipt.gatewayTxId,
      status: 'PAID',
      amount: Number(receipt.amount),
      currency: receipt.currency,
    });
    if (!event) {
      throw new BadRequestException('Could not read the gateway response');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentReceipt.update({
        where: { id: paymentId },
        data: {
          status: event.status,
          payoutStatus: event.status === 'PAID' ? 'ACCRUED' : 'FAILED',
        },
      });
      if (event.status === 'PAID' && receipt.instalmentId) {
        await tx.paymentInstalment.update({
          where: { id: receipt.instalmentId },
          data: { status: 'PAID', paidAt: new Date() },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'payment.confirmed',
          entityType: 'PaymentReceipt',
          entityId: paymentId,
          metadata: {
            status: event.status,
            amount: event.amount,
            currency: event.currency,
          },
        },
      });
    });

    // The first payment received (the deposit, or the full amount) confirms
    // the booking (M4 D3); the reservation service owns the state machine and
    // the best-effort documents. A later payment, the balance, only marks its
    // instalment.
    const reservation = await this.requireReservation(reservationId);
    if (
      event.status !== 'PAID' ||
      reservation.status !== ReservationStatus.PendingPayment
    ) {
      return toReservationDto(reservation);
    }
    return this.reservations.transition(
      reservationId,
      { to: ReservationStatus.Confirmed },
      actor,
    );
  }

  private async requireReservation(id: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) {
      throw new NotFoundException(`Reservation ${id} not found`);
    }
    return reservation;
  }
}

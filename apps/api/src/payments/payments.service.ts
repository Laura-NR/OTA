import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { PaymentReceipt } from '@ota/db';
import { ReservationStatus } from '@ota/domain';
import type { PaymentProvider } from '@ota/payments';
import type {
  CreatePaymentIntentRequest,
  PaymentIntentDto,
  PaymentReceiptDto,
  ReservationDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from '../reservations/reservations.service';
import { PAYMENT_PROVIDER } from './payments.tokens';

function toReceiptDto(receipt: PaymentReceipt): PaymentReceiptDto {
  return {
    id: receipt.id,
    reservationId: receipt.reservationId,
    rail: receipt.rail,
    amount: receipt.amount.toString(),
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
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async list(reservationId: string): Promise<PaymentReceiptDto[]> {
    await this.requireReservation(reservationId);

    const receipts = await this.prisma.paymentReceipt.findMany({
      where: { reservationId },
      orderBy: { createdAt: 'desc' },
    });
    return receipts.map(toReceiptDto);
  }

  /**
   * Generate a payment link for a secured booking (spec §7.1). Creating the
   * link is what moves SECURED_AND_INVOICED -> PENDING_PAYMENT; a booking that
   * is already awaiting payment may take a second rail.
   */
  async createIntent(
    reservationId: string,
    input: CreatePaymentIntentRequest,
    actor: AuthUser,
  ): Promise<PaymentIntentDto> {
    const reservation = await this.requireReservation(reservationId);
    const status = reservation.status as ReservationStatus;
    if (
      status !== ReservationStatus.SecuredAndInvoiced &&
      status !== ReservationStatus.PendingPayment
    ) {
      throw new ConflictException(
        'A payment link can only be created once the booking is secured and invoiced',
      );
    }

    const intent = await this.provider.createIntent({
      reference: reservation.bookingCode,
      amount: Number(reservation.totalAmount),
      currency: reservation.totalCurrency,
      rail: input.rail,
    });

    const receipt = await this.prisma.$transaction(async (tx) => {
      const created = await tx.paymentReceipt.create({
        data: {
          reservationId,
          gatewayTxId: intent.providerReference,
          rail: input.rail,
          currency: reservation.totalCurrency,
          amount: reservation.totalAmount,
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
            amount: reservation.totalAmount.toString(),
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
   * can confirm. On PAID the booking moves to CONFIRMED, which issues documents.
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

    const event = this.provider.parseWebhook({
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

    // Funds cleared: the reservation service owns the state machine and the
    // best-effort document generation on CONFIRMED.
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

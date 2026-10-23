import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import type { Prisma } from '@ota/db';
import {
  ReservationStatus,
  buildSchedule,
  refundDecision,
  type RefundThresholds,
} from '@ota/domain';
import type {
  ExtendInstalmentRequest,
  InstalmentDto,
  PaymentScheduleDto,
  RefundDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { OperatingSettingsService } from '../settings/operating-settings.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';
import { depositPolicyFor } from './payment-terms';
import { toReceiptDto } from './payments.service';

export const REFUND_INCLUDE = {
  approvals: {
    orderBy: { createdAt: 'asc' as const },
    include: { approver: { select: { email: true, role: true } } },
  },
  requestedBy: { select: { email: true } },
  receipt: { select: { rail: true } },
  reservation: { select: { bookingCode: true } },
};

export type RefundRow = Prisma.RefundGetPayload<{ include: typeof REFUND_INCLUDE }>;

const SCHEDULE_INCLUDE = {
  instalments: { orderBy: { position: 'asc' as const } },
  payments: {
    orderBy: { createdAt: 'asc' as const },
    include: { proofs: { orderBy: { createdAt: 'asc' as const } } },
  },
  refunds: { orderBy: { createdAt: 'asc' as const }, include: REFUND_INCLUDE },
  package: { select: { depositPolicy: true } },
};

type ScheduleRow = Prisma.ReservationGetPayload<{ include: typeof SCHEDULE_INCLUDE }>;

/** Statuses in which the traveler may still choose deposit or full. */
const CHOOSABLE: readonly string[] = [
  ReservationStatus.SecuredAndInvoiced,
  ReservationStatus.PendingPayment,
];

function toInstalmentDto(row: ScheduleRow['instalments'][number]): InstalmentDto {
  return {
    id: row.id,
    kind: row.kind,
    position: row.position,
    amount: row.amount.toFixed(2),
    currency: row.currency,
    dueAt: row.dueAt.toISOString(),
    status: row.status,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
  };
}

/** A refund with its votes and where its approvals stand (M4 D7). */
/** A refund with its decision under the refund limits in force (M4 D7, M9). */
export function toRefundDto(row: RefundRow, limits: RefundThresholds): RefundDto {
  const votes = row.approvals.map((approval) => ({
    approverId: approval.approverId,
    role: approval.approver.role,
    approve: approval.approve,
  }));
  return {
    id: row.id,
    reservationId: row.reservationId,
    bookingCode: row.reservation.bookingCode,
    receiptId: row.receiptId,
    rail: row.receipt.rail,
    amount: row.amount.toFixed(2),
    currency: row.currency,
    reason: row.reason,
    note: row.note,
    rule: (row.rule as RefundDto['rule']) ?? null,
    status: row.status,
    providerRefundId: row.providerRefundId,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    requestedByEmail: row.requestedBy?.email ?? null,
    approvals: row.approvals.map((approval) => ({
      approverEmail: approval.approver.email,
      approve: approval.approve,
      note: approval.note,
      createdAt: approval.createdAt.toISOString(),
    })),
    decision: refundDecision(Number(row.amount), votes, limits),
  };
}

/**
 * The M4 payment schedule of a booking (`docs/schema-m4-payment-schedule.md`):
 * its instalments, what the traveler may still choose, the receipts with
 * their proofs, and the refunds. Read by the desk and, scoped to the owner, by
 * the traveler.
 */
@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
    private readonly settings: OperatingSettingsService,
  ) {}

  async get(
    reservationId: string,
    options: { ownerId?: string } = {},
  ): Promise<PaymentScheduleDto> {
    const row = await this.prisma.reservation.findFirst({
      where: {
        id: reservationId,
        ...(options.ownerId ? { userId: options.ownerId } : {}),
      },
      include: SCHEDULE_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }

    const paid = row.payments
      .filter((receipt) => receipt.status === 'PAID')
      .reduce((sum, receipt) => sum + Number(receipt.amount), 0);
    const refunded = row.refunds
      .filter((refund) => refund.status === 'SENT')
      .reduce((sum, refund) => sum + Number(refund.amount), 0);

    const thresholds = await this.settings.thresholds();
    return {
      reservationId: row.id,
      currency: row.totalCurrency,
      total: row.totalAmount.toFixed(2),
      paid: paid.toFixed(2),
      refunded: refunded.toFixed(2),
      instalments: row.instalments.map(toInstalmentDto),
      options:
        row.instalments.length === 0 && CHOOSABLE.includes(row.status)
          ? this.options(row, thresholds.paymentWindowHours)
          : null,
      nextInstalmentId:
        row.instalments.find((instalment) => instalment.status === 'DUE')?.id ?? null,
      windowHours: thresholds.paymentWindowHours,
      cardFeePercent: this.tenant.payments.cardFeePercent,
      receipts: row.payments.map((receipt) => ({
        ...toReceiptDto(receipt),
        reference: receipt.gatewayTxId,
        proofs: receipt.proofs.map((proof) => ({
          id: proof.id,
          receiptId: proof.receiptId,
          status: proof.status,
          reviewNote: proof.reviewNote,
          createdAt: proof.createdAt.toISOString(),
          reviewedAt: proof.reviewedAt ? proof.reviewedAt.toISOString() : null,
        })),
      })),
      refunds: row.refunds.map((refund) =>
        toRefundDto(refund, {
          singleUpTo: thresholds.refundSingleUpTo,
          dualUpTo: thresholds.refundDualUpTo,
        }),
      ),
    };
  }

  /**
   * More time on an instalment still due (A-Payments "Extend 24 h + new
   * link"): from now, or from its due date if that is later. Audited.
   */
  async extend(
    reservationId: string,
    instalmentId: string,
    input: ExtendInstalmentRequest,
    actor: AuthUser,
  ): Promise<InstalmentDto> {
    const instalment = await this.prisma.paymentInstalment.findUnique({
      where: { id: instalmentId },
    });
    if (!instalment || instalment.reservationId !== reservationId) {
      throw new NotFoundException(`Instalment ${instalmentId} is not on this booking`);
    }
    if (instalment.status !== 'DUE') {
      throw new ConflictException(`The instalment is already ${instalment.status}`);
    }
    const from = Math.max(Date.now(), instalment.dueAt.getTime());
    const dueAt = new Date(from + input.hours * 3_600_000);

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.paymentInstalment.update({
        where: { id: instalmentId },
        data: { dueAt },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'payment.window_extended',
          entityType: 'Reservation',
          entityId: reservationId,
          metadata: {
            instalmentId,
            kind: instalment.kind,
            from: instalment.dueAt.toISOString(),
            to: dueAt.toISOString(),
          },
        },
      });
      return saved;
    });
    return toInstalmentDto(updated);
  }

  /** Deposit or full, as the first link would build them now. */
  private options(row: ScheduleRow, windowHours: number): PaymentScheduleDto['options'] {
    const total = Number(row.totalAmount);
    const policy = depositPolicyFor(this.tenant, row.package?.depositPolicy);
    const deposit = buildSchedule({
      total,
      plan: 'DEPOSIT',
      policy,
      departure: row.startDate,
      now: new Date(),
      windowHours,
    });
    return {
      full: { amount: total.toFixed(2) },
      deposit:
        deposit && policy
          ? {
              amount: deposit[0]!.amount.toFixed(2),
              balance: deposit[1]!.amount.toFixed(2),
              balanceDueAt: deposit[1]!.dueAt.toISOString(),
              percent: policy.percent,
            }
          : null,
    };
  }
}

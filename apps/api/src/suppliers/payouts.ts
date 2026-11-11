import type { Prisma } from '@ota/db';
import {
  JOB_STATUSES,
  ReservationStatus,
  type EarningsTotal,
  type WorkerEarnings,
  type WorkerEarningsJob,
} from '@ota/domain';
import type { PayoutTotalDto, SupplierPayoutsDto } from '@ota/schemas';

/** The base currency every payout is kept in. */
export const PAYOUT_CURRENCY = 'EUR';

/**
 * The service items that can count toward a worker's pay: taken, ended by
 * `now`, on a booking not cancelled. `isFinishedJob` (domain) decides; this
 * only narrows the read.
 */
export function finishedJobsWhere(
  supplierId: string,
  now: Date,
): Prisma.ServiceItemWhereInput {
  return {
    supplierId,
    status: { in: [...JOB_STATUSES] },
    serviceDateEnd: { lte: now },
    reservation: { status: { not: ReservationStatus.Cancelled } },
  };
}

/** A `Decimal(10,2)` payout in whole cents, so sums stay exact. */
export function payoutCents(rate: Prisma.Decimal): number {
  return rate.mul(100).round().toNumber();
}

export function centsText(cents: number): string {
  return (cents / 100).toFixed(2);
}

function toTotal(total: EarningsTotal): PayoutTotalDto {
  return { amount: centsText(total.cents), jobs: total.jobs };
}

export function toPayoutsDto<T extends WorkerEarningsJob>(
  earnings: WorkerEarnings<T>,
): SupplierPayoutsDto {
  return {
    currency: PAYOUT_CURRENCY,
    pending: toTotal(earnings.pending),
    thisMonth: toTotal(earnings.thisMonth),
    paidThisYear: toTotal(earnings.paidThisYear),
    issue: toTotal(earnings.issue),
    year: earnings.year,
  };
}

import type { Prisma } from '@ota/db';
import {
  JOB_STATUSES,
  ReservationStatus,
  nextPayDay,
  type EarningsTotal,
  type PayoutMethod,
  type PayoutRule,
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

/** What a finished job's payout is read with: its booking's state and the payment that settled it. */
export const PAYOUT_JOB_SELECT = {
  status: true,
  serviceDateEnd: true,
  payoutRate: true,
  payoutStatus: true,
  reservation: { select: { status: true } },
  payout: { select: { paidAt: true } },
} satisfies Prisma.ServiceItemSelect;

type PayoutJobRow = Prisma.ServiceItemGetPayload<{ select: typeof PAYOUT_JOB_SELECT }>;

/** A service item as the domain's earnings rules read it. */
export function toEarningsJob(item: PayoutJobRow): WorkerEarningsJob {
  return {
    status: item.status,
    reservationStatus: item.reservation.status,
    endsAt: item.serviceDateEnd,
    payoutCents: payoutCents(item.payoutRate),
    payoutStatus: item.payoutStatus,
    paidAt: item.payout?.paidAt ?? null,
  };
}

/** The pay rule (E4) and where cash is collected. */
export interface PayoutTerms extends PayoutRule {
  office: string | null;
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

/**
 * The totals, the worker's method and the next pay day: the same figures on
 * the desk's inspector and in the worker app.
 */
export function toPayoutsDto<T extends WorkerEarningsJob>(
  earnings: WorkerEarnings<T>,
  jobs: readonly WorkerEarningsJob[],
  method: PayoutMethod | null,
  terms: PayoutTerms,
  now: Date,
): SupplierPayoutsDto {
  return {
    currency: PAYOUT_CURRENCY,
    pending: toTotal(earnings.pending),
    thisMonth: toTotal(earnings.thisMonth),
    paidThisYear: toTotal(earnings.paidThisYear),
    issue: toTotal(earnings.issue),
    year: earnings.year,
    method,
    office: terms.office,
    businessDays: terms.businessDays,
    nextPayDay: nextPayDay(jobs, now, terms),
  };
}

import { RESERVATION_STATUSES, type ReservationStatus } from '../reservation/status';

export interface RailTotal {
  rail: string;
  amount: number;
  count: number;
}

export interface FinanceKpis {
  gbv: number;
  payoutsAccrued: number;
  payoutsSettled: number;
  netRevenue: number;
  /** Net revenue / GBV, 0 when there is no gross volume. */
  takeRate: number;
  averageOrderValue: number;
  paidCount: number;
  byRail: RailTotal[];
}

export interface FinanceInput {
  paid: { amount: number; rail: string }[];
  payouts: { payoutRate: number; payoutStatus: string }[];
}

export interface OperationsKpis {
  offers: number;
  accepted: number;
  declined: number;
  timedOut: number;
  pending: number;
  acceptanceRate: number;
  timeoutRate: number;
  /** Mean minutes between offer and acceptance, over accepted offers. */
  averageResponseMinutes: number;
  funnel: { status: ReservationStatus; count: number }[];
}

export interface OperationsInput {
  offers: { status: string; offeredAt: Date; respondedAt: Date | null }[];
  reservations: { status: string }[];
}

export interface QualityKpis {
  reviewCount: number;
  averageRating: number;
  incidentCount: number;
}

export interface GeographyKpi {
  province: string;
  count: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function ratio(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 10000) / 10000 : 0;
}

/** Gross booking value, agency margin, take rate, and AOV from the ledger. */
export function calculateFinance(input: FinanceInput): FinanceKpis {
  const gbv = round2(input.paid.reduce((sum, payment) => sum + payment.amount, 0));
  const payoutsAccrued = round2(
    input.payouts
      .filter((payout) => payout.payoutStatus === 'ACCRUED')
      .reduce((sum, payout) => sum + payout.payoutRate, 0),
  );
  const payoutsSettled = round2(
    input.payouts
      .filter((payout) => payout.payoutStatus === 'SETTLED')
      .reduce((sum, payout) => sum + payout.payoutRate, 0),
  );
  const netRevenue = round2(gbv - payoutsAccrued - payoutsSettled);

  const byRailMap = new Map<string, { amount: number; count: number }>();
  for (const payment of input.paid) {
    const entry = byRailMap.get(payment.rail) ?? { amount: 0, count: 0 };
    entry.amount += payment.amount;
    entry.count += 1;
    byRailMap.set(payment.rail, entry);
  }
  const byRail = [...byRailMap.entries()]
    .map(([rail, value]) => ({ rail, amount: round2(value.amount), count: value.count }))
    .sort((a, b) => b.amount - a.amount);

  return {
    gbv,
    payoutsAccrued,
    payoutsSettled,
    netRevenue,
    takeRate: ratio(netRevenue, gbv),
    averageOrderValue: input.paid.length > 0 ? round2(gbv / input.paid.length) : 0,
    paidCount: input.paid.length,
    byRail,
  };
}

/** Dispatch acceptance/timeout and the booking conversion funnel. */
export function calculateOperations(input: OperationsInput): OperationsKpis {
  const offers = input.offers.length;
  const count = (status: string) =>
    input.offers.filter((offer) => offer.status === status).length;
  const accepted = count('ACCEPTED');
  const declined = count('DECLINED');
  const timedOut = count('TIMEOUT');
  const pending = count('OFFERED');

  const responded = input.offers.filter(
    (offer): offer is { status: string; offeredAt: Date; respondedAt: Date } =>
      offer.status === 'ACCEPTED' && offer.respondedAt !== null,
  );
  const averageResponseMinutes =
    responded.length > 0
      ? round2(
          responded.reduce(
            (sum, offer) =>
              sum + (offer.respondedAt.getTime() - offer.offeredAt.getTime()) / 60000,
            0,
          ) / responded.length,
        )
      : 0;

  const funnel = RESERVATION_STATUSES.map((status) => ({
    status,
    count: input.reservations.filter((reservation) => reservation.status === status)
      .length,
  }));

  return {
    offers,
    accepted,
    declined,
    timedOut,
    pending,
    acceptanceRate: ratio(accepted, offers),
    timeoutRate: ratio(timedOut, offers),
    averageResponseMinutes,
    funnel,
  };
}

export function calculateQuality(input: {
  ratings: number[];
  incidentCount: number;
}): QualityKpis {
  const reviewCount = input.ratings.length;
  return {
    reviewCount,
    averageRating:
      reviewCount > 0
        ? round2(input.ratings.reduce((sum, rating) => sum + rating, 0) / reviewCount)
        : 0,
    incidentCount: input.incidentCount,
  };
}

/** Geographic distribution of booked services, most booked first. */
export function calculateGeography(
  serviceItems: { province: string | null }[],
): GeographyKpi[] {
  const map = new Map<string, number>();
  for (const item of serviceItems) {
    const province = item.province ?? 'Unspecified';
    map.set(province, (map.get(province) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([province, count]) => ({ province, count }))
    .sort((a, b) => b.count - a.count);
}

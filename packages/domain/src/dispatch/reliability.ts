export interface ReliabilityOffer {
  supplierId: string;
  status: string;
  offeredAt: Date;
  respondedAt: Date | null;
}

/**
 * The acceptance rate below which a supplier leaves automatic dispatch until
 * reviewed (A-Suppliers); the desk can still assign them by hand.
 */
export const RELIABILITY_FLOOR = 0.85;

/** The floor applies only once a supplier has answered this many offers. */
export const RELIABILITY_MIN_ANSWERED = 5;

/** Offer states that are an answer; an open or cancelled offer is not. */
const ANSWERED_STATUSES = ['ACCEPTED', 'DECLINED', 'TIMEOUT'];

export interface SupplierReliability {
  supplierId: string;
  /** Every offer made, answered or not. */
  offers: number;
  /** Offers accepted, declined or timed out: the base of the rates. */
  answered: number;
  accepted: number;
  declined: number;
  timedOut: number;
  acceptanceRate: number;
  timeoutRate: number;
  /** Mean minutes between offer and acceptance, over accepted offers. */
  averageResponseMinutes: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function ratio(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 10000) / 10000 : 0;
}

/**
 * Worker reliability scorecards from the dispatch-offer ledger (spec §4.9.4):
 * acceptance and timeout rates over the answered offers, so an offer still
 * open or cancelled by the desk never counts against the supplier, plus
 * average response latency per supplier, best acceptance first. Pure — the
 * caller fetches the offers.
 */
export function calculateSupplierReliability(
  offers: ReliabilityOffer[],
): SupplierReliability[] {
  const bySupplier = new Map<string, ReliabilityOffer[]>();
  for (const offer of offers) {
    const list = bySupplier.get(offer.supplierId) ?? [];
    list.push(offer);
    bySupplier.set(offer.supplierId, list);
  }

  return [...bySupplier.entries()]
    .map(([supplierId, supplierOffers]) => {
      const count = (status: string) =>
        supplierOffers.filter((offer) => offer.status === status).length;
      const accepted = count('ACCEPTED');
      const answered = supplierOffers.filter((offer) =>
        ANSWERED_STATUSES.includes(offer.status),
      ).length;
      const responded = supplierOffers.filter(
        (offer): offer is ReliabilityOffer & { respondedAt: Date } =>
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

      return {
        supplierId,
        offers: supplierOffers.length,
        answered,
        accepted,
        declined: count('DECLINED'),
        timedOut: count('TIMEOUT'),
        acceptanceRate: ratio(accepted, answered),
        timeoutRate: ratio(count('TIMEOUT'), answered),
        averageResponseMinutes,
      };
    })
    .sort((a, b) => b.acceptanceRate - a.acceptanceRate || b.offers - a.offers);
}

/**
 * Whether a supplier may still receive automatic offers: below the floor
 * over at least `minAnswered` answered offers, they may not. A supplier with
 * no scorecard, or too few answers to judge, passes.
 */
export function meetsReliabilityFloor(
  scorecard: Pick<SupplierReliability, 'answered' | 'acceptanceRate'> | null,
  floor: number = RELIABILITY_FLOOR,
  minAnswered: number = RELIABILITY_MIN_ANSWERED,
): boolean {
  if (!scorecard || scorecard.answered < minAnswered) return true;
  return scorecard.acceptanceRate >= floor;
}

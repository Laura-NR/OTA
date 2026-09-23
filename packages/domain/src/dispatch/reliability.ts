export interface ReliabilityOffer {
  supplierId: string;
  status: string;
  offeredAt: Date;
  respondedAt: Date | null;
}

export interface SupplierReliability {
  supplierId: string;
  offers: number;
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
 * acceptance and timeout rates plus average response latency per supplier,
 * best acceptance first. Pure — the caller fetches the offers.
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
        accepted,
        declined: count('DECLINED'),
        timedOut: count('TIMEOUT'),
        acceptanceRate: ratio(accepted, supplierOffers.length),
        timeoutRate: ratio(count('TIMEOUT'), supplierOffers.length),
        averageResponseMinutes,
      };
    })
    .sort((a, b) => b.acceptanceRate - a.acceptanceRate || b.offers - a.offers);
}

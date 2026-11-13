/**
 * Where a booking's provider requests stand (D-Proposal's "we send the
 * requests to your hosts, guides and driver"): the dispatch ledger read as a
 * summary a traveler may see. No provider is named.
 */
export interface ProviderProgress {
  /** Services on the booking. */
  services: number;
  /** Taken by a provider (accepted or already delivered). */
  confirmed: number;
  /** Offered to a provider who has not answered yet. */
  awaiting: number;
  /** Not yet offered, or declined / timed out and back with the desk. */
  arranging: number;
  /** Requests sent to providers so far (withdrawn offers are not counted). */
  requestsSent: number;
  /** Requests a provider has answered, yes or no. */
  answered: number;
}

export interface ProviderProgressItem {
  status: string;
  offers: readonly { status: string }[];
}

const CONFIRMED = new Set(['ACCEPTED', 'FULFILLED']);

export function providerProgress(
  items: readonly ProviderProgressItem[],
): ProviderProgress {
  const offers = items.flatMap((item) => item.offers);
  return {
    services: items.length,
    confirmed: items.filter((item) => CONFIRMED.has(item.status)).length,
    awaiting: items.filter((item) => item.status === 'OFFERED').length,
    arranging: items.filter(
      (item) => !CONFIRMED.has(item.status) && item.status !== 'OFFERED',
    ).length,
    requestsSent: offers.filter((offer) => offer.status !== 'CANCELLED').length,
    answered: offers.filter(
      (offer) => offer.status === 'ACCEPTED' || offer.status === 'DECLINED',
    ).length,
  };
}

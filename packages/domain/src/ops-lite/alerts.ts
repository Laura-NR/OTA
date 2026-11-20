export interface RedAlertEntry {
  bookingId: string;
  /** When the item turned red (`redSince`); null when unknown. */
  since: Date | null;
}

export interface RedAlertCard<T extends RedAlertEntry> {
  bookingId: string;
  /** The booking's oldest red item, which the card is titled after. */
  lead: T;
  /** The booking's other red items ("Also red on this booking"). */
  others: T[];
}

const sinceMs = (entry: RedAlertEntry) =>
  entry.since?.getTime() ?? Number.POSITIVE_INFINITY;

/**
 * AL-Alerts' red cards: one per booking, led by its oldest red item, the
 * longest-red booking first. An item with no known red time sorts last.
 */
export function redAlertCards<T extends RedAlertEntry>(
  entries: readonly T[],
): RedAlertCard<T>[] {
  const byBooking = new Map<string, T[]>();
  for (const entry of [...entries].sort((a, b) => sinceMs(a) - sinceMs(b))) {
    const group = byBooking.get(entry.bookingId);
    if (group) group.push(entry);
    else byBooking.set(entry.bookingId, [entry]);
  }
  return [...byBooking.entries()].map(([bookingId, [lead, ...others]]) => ({
    bookingId,
    lead: lead!,
    others,
  }));
}

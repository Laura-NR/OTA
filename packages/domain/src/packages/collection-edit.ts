/**
 * Saving a package's departures, tiers and extras (spec §3.3, A-Package-Edit).
 * Bookings point at those rows, so a save matches what it submits to what is
 * stored on the row's natural key and keeps the row, instead of replacing it.
 * A row bookings use cannot go, and a departure cannot shrink below its booked
 * seats. Pure, so the rules are unit-tested.
 */

export interface CollectionEdit<Stored, Submitted> {
  create: Submitted[];
  update: { stored: Stored; submitted: Submitted }[];
  remove: Stored[];
  /** Keys submitted more than once; each stored key is unique. */
  duplicates: string[];
}

export function planCollectionEdit<Stored, Submitted>(
  stored: readonly Stored[],
  submitted: readonly Submitted[],
  storedKey: (row: Stored) => string,
  submittedKey: (row: Submitted) => string,
): CollectionEdit<Stored, Submitted> {
  const byKey = new Map(stored.map((row) => [storedKey(row), row]));
  const seen = new Set<string>();
  const edit: CollectionEdit<Stored, Submitted> = {
    create: [],
    update: [],
    remove: [],
    duplicates: [],
  };

  for (const row of submitted) {
    const key = submittedKey(row);
    if (seen.has(key)) {
      if (!edit.duplicates.includes(key)) edit.duplicates.push(key);
      continue;
    }
    seen.add(key);
    const match = byKey.get(key);
    if (match === undefined) edit.create.push(row);
    else edit.update.push({ stored: match, submitted: row });
  }
  edit.remove = stored.filter((row) => !seen.has(storedKey(row)));
  return edit;
}

/** A booking that is not cancelled, on one departure, tier or extra. */
export interface RowBooking {
  rowId: string;
  bookingCode: string;
  partySize: number;
}

export type BookedRowKind = 'DEPARTURE_BOOKED' | 'TIER_BOOKED' | 'EXTRA_BOOKED';

export type PackageEditRefusal =
  | { kind: 'ROW_DUPLICATED'; row: string }
  | { kind: BookedRowKind; row: string; bookingCodes: string[] }
  | {
      kind: 'DEPARTURE_BELOW_BOOKED';
      row: string;
      capacity: number;
      booked: number;
      bookingCodes: string[];
    };

function codesOn(rowId: string, bookings: readonly RowBooking[]): string[] {
  const codes = bookings
    .filter((booking) => booking.rowId === rowId)
    .map((booking) => booking.bookingCode);
  return [...new Set(codes)].sort();
}

/** Why a save cannot leave this collection as submitted; empty if it can. */
export function collectionEditRefusals<Stored extends { id: string }, Submitted>(
  kind: BookedRowKind,
  edit: CollectionEdit<Stored, Submitted>,
  rowName: (row: Stored) => string,
  bookings: readonly RowBooking[],
): PackageEditRefusal[] {
  const refusals: PackageEditRefusal[] = edit.duplicates.map((row) => ({
    kind: 'ROW_DUPLICATED',
    row,
  }));
  for (const row of edit.remove) {
    const bookingCodes = codesOn(row.id, bookings);
    if (bookingCodes.length > 0) {
      refusals.push({ kind, row: rowName(row), bookingCodes });
    }
  }
  return refusals;
}

/** Departures a save would leave with fewer seats than are booked on them. */
export function departureCapacityRefusals<
  Stored extends { id: string },
  Submitted extends { capacity: number },
>(
  edit: CollectionEdit<Stored, Submitted>,
  rowName: (row: Stored) => string,
  bookings: readonly RowBooking[],
): PackageEditRefusal[] {
  const refusals: PackageEditRefusal[] = [];
  for (const { stored, submitted } of edit.update) {
    const booked = bookings
      .filter((booking) => booking.rowId === stored.id)
      .reduce((seats, booking) => seats + booking.partySize, 0);
    if (submitted.capacity < booked) {
      refusals.push({
        kind: 'DEPARTURE_BELOW_BOOKED',
        row: rowName(stored),
        capacity: submitted.capacity,
        booked,
        bookingCodes: codesOn(stored.id, bookings),
      });
    }
  }
  return refusals;
}

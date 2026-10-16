/**
 * M2 booking-side pricing (spec §3.3, A-Booking price breakdown): turns the M1
 * package price into the lines a booking freezes — base, tier, each child's
 * band rate, single supplements, extras and the agency's fees — so an invoice
 * stays reproducible when the package's tiers or departures later change.
 *
 * The arithmetic is the M1 `calculatePackagePrice` rule (departure or base,
 * plus the tier delta; children at a band rate of that; supplements per single
 * room; per-person extras count every traveler), but each line is rounded on
 * its own and the total is the sum of the lines, as an invoice must add up.
 */

import { ReservationStatus } from '../reservation/status';
import { childRate, type ChildBand, type ExtraUnit } from './pricing';

export type TravelerKind = 'ADULT' | 'CHILD' | 'INFANT';

export type PriceLineKind =
  'BASE' | 'TIER' | 'CHILD' | 'SINGLE_SUPPLEMENT' | 'EXTRA' | 'SERVICE' | 'FEE';

export interface BookingTravelerInput {
  kind: TravelerKind;
  /** Whole years at departure; null prices a child at the adult rate. */
  age: number | null;
}

export interface BookingTierInput {
  name: string;
  priceDelta: number;
  /** Per single room, or null when the tier has no supplement. */
  singleSupplement: number | null;
}

export interface BookingExtraInput {
  label: string;
  unit: ExtraUnit;
  unitAmount: number;
  /** How many of this extra; per-person extras multiply it by the party. */
  quantity: number;
}

export interface BookingFeeInput {
  label: string;
  unit: ExtraUnit;
  amount: number;
}

export interface BookingPriceInput {
  packageName: string;
  basePrice: number;
  /** The departure's per-person price; null falls back to `basePrice`. */
  departurePrice: number | null;
  tier: BookingTierInput | null;
  travelers: readonly BookingTravelerInput[];
  childBands: readonly ChildBand[];
  singleRooms: number;
  extras: readonly BookingExtraInput[];
  fees: readonly BookingFeeInput[];
}

export interface BookingPriceLine {
  kind: PriceLineKind;
  label: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  /** The traveler (index into `travelers`) a per-person line is for; else null. */
  travelerIndex: number | null;
}

export interface BookingPrice {
  lines: BookingPriceLine[];
  partySize: number;
  total: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function line(
  kind: PriceLineKind,
  label: string,
  quantity: number,
  unitAmount: number,
  travelerIndex: number | null = null,
): BookingPriceLine {
  return {
    kind,
    label,
    quantity,
    unitAmount: round2(unitAmount),
    amount: round2(unitAmount * quantity),
    travelerIndex,
  };
}

/** Whole years between a date of birth and a day, both read as UTC dates. */
export function ageOn(dateOfBirth: Date, on: Date): number {
  let age = on.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (on.getUTCMonth() === dateOfBirth.getUTCMonth() &&
      on.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) {
    age -= 1;
  }
  return age;
}

export function priceBooking(input: BookingPriceInput): BookingPrice {
  const startPrice = input.departurePrice ?? input.basePrice;
  const tierDelta = input.tier?.priceDelta ?? 0;
  const perPerson = round2(startPrice + tierDelta);
  const partySize = input.travelers.length;
  const adults = input.travelers.filter((traveler) => traveler.kind === 'ADULT').length;

  const lines: BookingPriceLine[] = [];

  if (adults > 0) {
    lines.push(line('BASE', input.packageName, adults, startPrice));
    if (input.tier && tierDelta !== 0) {
      lines.push(line('TIER', input.tier.name, adults, tierDelta));
    }
  }

  input.travelers.forEach((traveler, index) => {
    if (traveler.kind === 'ADULT') {
      return;
    }
    // A negative age matches no band, so a child without one pays the adult rate.
    const rate = childRate(traveler.age ?? -1, input.childBands);
    lines.push(line('CHILD', input.packageName, 1, perPerson * rate, index));
  });

  const supplement = input.tier?.singleSupplement ?? null;
  if (input.tier && supplement !== null && input.singleRooms > 0) {
    lines.push(line('SINGLE_SUPPLEMENT', input.tier.name, input.singleRooms, supplement));
  }

  for (const extra of input.extras) {
    const units = extra.unit === 'PER_PERSON' ? partySize : 1;
    lines.push(line('EXTRA', extra.label, extra.quantity * units, extra.unitAmount));
  }

  for (const fee of input.fees) {
    const units = fee.unit === 'PER_PERSON' ? partySize : 1;
    lines.push(line('FEE', fee.label, units, fee.amount));
  }

  return {
    lines,
    partySize,
    total: round2(lines.reduce((sum, entry) => sum + entry.amount, 0)),
  };
}

/**
 * Once a payment link exists the traveler has been asked for a figure, so the
 * frozen lines may no longer move: from PENDING_PAYMENT on (and once
 * cancelled) a change that reprices the booking is refused.
 */
export const PRICE_LOCKED_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.PendingPayment,
  ReservationStatus.Confirmed,
  ReservationStatus.InProgress,
  ReservationStatus.Completed,
  ReservationStatus.Cancelled,
];

export function isPriceLocked(status: ReservationStatus): boolean {
  return PRICE_LOCKED_STATUSES.includes(status);
}

/** Places a departure still has once `booked` travelers hold seats on it. */
export function departurePlacesLeft(capacity: number, booked: number): number {
  return Math.max(0, capacity - booked);
}

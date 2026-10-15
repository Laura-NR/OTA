/**
 * M1 Package pricing (spec §3.3, A-Package-Edit): a package's per-person price
 * is the departure price (or the package base) plus the chosen tier's delta;
 * children pay a band rate; single rooms add a supplement; extras are priced
 * per person or per booking. Pure arithmetic, so the tiers/departures/extras
 * model is unit-tested without a database.
 */

export type ExtraUnit = 'PER_PERSON' | 'PER_BOOKING';

export interface ChildBand {
  /** The inclusive upper bound of the child's age for this rate. */
  maxAge: number;
  /** Fraction of the adult per-person price, e.g. 0.5 for a half rate. */
  rate: number;
}

export interface PackageExtraInput {
  price: number;
  unit: ExtraUnit;
  /** How many of this extra; defaults to 1. */
  quantity?: number;
}

export interface PackagePriceInput {
  basePrice: number;
  /** The departure's per-person price; null falls back to `basePrice`. */
  departurePrice: number | null;
  /** The chosen tier's per-person delta. */
  tierDelta: number;
  /** Per single room, or null when the tier has no supplement. */
  singleSupplement: number | null;
  adults: number;
  childAges: readonly number[];
  childBands: readonly ChildBand[];
  extras: readonly PackageExtraInput[];
  singleRooms: number;
}

export interface PackagePriceBreakdown {
  perPerson: number;
  adultsTotal: number;
  childrenTotal: number;
  singlesTotal: number;
  extrasTotal: number;
  total: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * A child's rate as a fraction of the adult price: the first band whose
 * `maxAge` the age does not exceed, cheapest-matching by ascending age wins.
 * No matching band (or a negative age) means the full adult rate.
 */
export function childRate(age: number, bands: readonly ChildBand[]): number {
  if (age < 0) {
    return 1;
  }
  const match = [...bands]
    .sort((a, b) => a.maxAge - b.maxAge)
    .find((band) => age <= band.maxAge);
  return match ? match.rate : 1;
}

export function calculatePackagePrice(input: PackagePriceInput): PackagePriceBreakdown {
  const perPerson = round2((input.departurePrice ?? input.basePrice) + input.tierDelta);
  const travelers = input.adults + input.childAges.length;

  const adultsTotal = round2(perPerson * input.adults);

  const childrenTotal = round2(
    input.childAges.reduce(
      (sum, age) => sum + perPerson * childRate(age, input.childBands),
      0,
    ),
  );

  const singlesTotal = round2((input.singleSupplement ?? 0) * input.singleRooms);

  const extrasTotal = round2(
    input.extras.reduce((sum, extra) => {
      const quantity = extra.quantity ?? 1;
      const units = extra.unit === 'PER_PERSON' ? travelers : 1;
      return sum + extra.price * quantity * units;
    }, 0),
  );

  return {
    perPerson,
    adultsTotal,
    childrenTotal,
    singlesTotal,
    extrasTotal,
    total: round2(adultsTotal + childrenTotal + singlesTotal + extrasTotal),
  };
}

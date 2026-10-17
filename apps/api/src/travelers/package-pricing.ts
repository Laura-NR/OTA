import type { TenantConfig } from '@ota/config';
import type { Package, PackageDeparture, PackageTier, Prisma } from '@ota/db';
import {
  ageOn,
  priceBooking,
  type BookingExtraInput,
  type BookingPrice,
  type TravelerKind,
} from '@ota/domain';

/** What a package booking is priced on, as stored or as chosen in the Booking form. */
export interface PackagePricingChoice {
  tier: PackageTier | null;
  departure: PackageDeparture | null;
  /** The day ages are read on: the departure, else the booking's start. */
  travelDate: Date;
  travelers: readonly { kind: TravelerKind; dateOfBirth: Date | null }[];
  singleRooms: number;
  extras: readonly BookingExtraInput[];
}

/**
 * Price a package booking with the domain `priceBooking` (M2): the departure's
 * price or the package's, the tier's delta and supplement, children at their
 * band rate on the travel date, the extras and the manifest's fees. Shared by
 * the desk's party panel and the traveler's Booking form so both freeze the
 * same lines.
 */
export function pricePackageChoice(
  pkg: Pick<Package, 'name' | 'basePrice'>,
  choice: PackagePricingChoice,
  pricing: TenantConfig['pricing'],
): BookingPrice {
  const { tier, departure } = choice;
  return priceBooking({
    packageName: pkg.name,
    basePrice: Number(pkg.basePrice),
    departurePrice:
      departure && departure.price !== null ? Number(departure.price) : null,
    tier: tier
      ? {
          name: tier.name,
          priceDelta: Number(tier.priceDelta),
          singleSupplement:
            tier.singleSupplement === null ? null : Number(tier.singleSupplement),
        }
      : null,
    travelers: choice.travelers.map((traveler) => ({
      kind: traveler.kind,
      age: traveler.dateOfBirth ? ageOn(traveler.dateOfBirth, choice.travelDate) : null,
    })),
    childBands: pricing.childBands,
    singleRooms: choice.singleRooms,
    extras: choice.extras,
    fees: pricing.fees,
  });
}

/** The frozen lines as rows, each per-person line linked to its traveler. */
export function priceLineRows(
  price: BookingPrice,
  reservationId: string,
  travelerIds: readonly string[],
  currency: string,
): Prisma.ReservationPriceLineCreateManyInput[] {
  return price.lines.map((line, position) => ({
    reservationId,
    travelerId:
      line.travelerIndex === null ? null : (travelerIds[line.travelerIndex] ?? null),
    kind: line.kind,
    label: line.label,
    quantity: line.quantity,
    unitAmount: line.unitAmount,
    amount: line.amount,
    currency,
    position,
  }));
}

import { ServiceType } from '../reservation/status';

/**
 * Statutory tourism classification (spec §4.9.2). `GENERAL` is the default so
 * every booking is reportable; operators classify the specialised ones.
 */
export const TourismCategory = {
  Ecotourism: 'ECOTOURISM',
  Agrotourism: 'AGROTOURISM',
  Nature: 'NATURE',
  Cultural: 'CULTURAL',
  General: 'GENERAL',
} as const;

export type TourismCategory = (typeof TourismCategory)[keyof typeof TourismCategory];

export const TOURISM_CATEGORIES: readonly TourismCategory[] =
  Object.values(TourismCategory);

/** Categories that qualify for the certified specialised-tourism ratio. */
export const SPECIALISED_TOURISM_CATEGORIES: readonly TourismCategory[] = [
  TourismCategory.Ecotourism,
  TourismCategory.Agrotourism,
  TourismCategory.Nature,
];

export interface RegulatoryServiceItem {
  serviceType: string;
  province: string | null;
  serviceDateStart: Date;
  serviceDateEnd: Date;
}

export interface RegulatoryReservation {
  userId: string;
  tourismCategory: string;
  nationality: string | null;
  serviceItems: RegulatoryServiceItem[];
}

export interface CategoryCount {
  category: string;
  count: number;
  ratio: number;
}

export interface NationalityCount {
  nationality: string;
  count: number;
}

export interface CircuitCount {
  province: string;
  count: number;
}

export interface RegulatorySummary {
  bookings: number;
  travelers: number;
  /** Accommodation nights across the window (per booking — see the handoff). */
  bedNights: number;
  /** ECOTOURISM + AGROTOURISM + NATURE over all bookings, 0 when empty. */
  specialisedRatio: number;
  byCategory: CategoryCount[];
  nationalities: NationalityCount[];
  circuits: CircuitCount[];
}

function ratio(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 10000) / 10000 : 0;
}

/** Whole nights between two date-only values; same day is zero, never negative. */
function nights(item: RegulatoryServiceItem): number {
  const millis = item.serviceDateEnd.getTime() - item.serviceDateStart.getTime();
  return Math.max(0, Math.round(millis / 86_400_000));
}

function isSpecialised(category: string): boolean {
  return (SPECIALISED_TOURISM_CATEGORIES as readonly string[]).includes(category);
}

/**
 * Reduce reservation rows into the figures the MINTUR annual activity summary
 * and the ecotourism ratio need (spec §4.9.2). Pure: the caller fetches rows.
 */
export function calculateRegulatory(
  reservations: RegulatoryReservation[],
): RegulatorySummary {
  const bookings = reservations.length;
  const travelers = new Set(reservations.map((reservation) => reservation.userId)).size;

  const categoryCounts = new Map<string, number>(
    TOURISM_CATEGORIES.map((category) => [category, 0]),
  );
  const nationalityCounts = new Map<string, number>();
  const circuitCounts = new Map<string, number>();
  let bedNights = 0;

  for (const reservation of reservations) {
    const { tourismCategory } = reservation;
    categoryCounts.set(tourismCategory, (categoryCounts.get(tourismCategory) ?? 0) + 1);

    const nationality = reservation.nationality ?? 'Unspecified';
    nationalityCounts.set(nationality, (nationalityCounts.get(nationality) ?? 0) + 1);

    for (const item of reservation.serviceItems) {
      if (item.serviceType === ServiceType.Accommodation) {
        bedNights += nights(item);
      }
      const province = item.province ?? 'Unspecified';
      circuitCounts.set(province, (circuitCounts.get(province) ?? 0) + 1);
    }
  }

  const byCategory = TOURISM_CATEGORIES.map((category) => {
    const count = categoryCounts.get(category) ?? 0;
    return { category, count, ratio: ratio(count, bookings) };
  });

  const specialised = reservations.filter((reservation) =>
    isSpecialised(reservation.tourismCategory),
  ).length;

  return {
    bookings,
    travelers,
    bedNights,
    specialisedRatio: ratio(specialised, bookings),
    byCategory,
    nationalities: [...nationalityCounts.entries()]
      .map(([nationality, count]) => ({ nationality, count }))
      .sort((a, b) => b.count - a.count),
    circuits: [...circuitCounts.entries()]
      .map(([province, count]) => ({ province, count }))
      .sort((a, b) => b.count - a.count),
  };
}

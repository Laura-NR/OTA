/**
 * Search, filter and sort the curated-package catalogue (Home search, Packages
 * filters, Compare). Pure: the storefront passes the public package list in and
 * renders what comes out, so the same rules hold on the server and the client.
 */

/** The fields of a package the search reads; `PackageDto` satisfies it. */
export interface SearchablePackage {
  name: string;
  description: string | null;
  province: string | null;
  durationDays: number;
  basePrice: string | number;
  services: readonly { itemName: string; itemProvince: string | null }[];
  /** Every stay claims backup power (M6 D6(b)); absent counts as no. */
  backupPower?: boolean;
}

/**
 * Trip-length buckets for the Duration filter. The board draws 3–5, 6–8 and
 * 9–12 days plus "Flexible"; the first bucket starts at one day so a short
 * trip is never unfilterable, the last is open-ended, and "Flexible" is the
 * custom builder rather than a package filter.
 */
export const DURATION_BUCKETS = [
  { id: 'short', min: 1, max: 5 },
  { id: 'week', min: 6, max: 8 },
  { id: 'long', min: 9, max: Number.POSITIVE_INFINITY },
] as const;

export type DurationBucketId = (typeof DURATION_BUCKETS)[number]['id'];

export const PACKAGE_SORTS = [
  'recommended',
  'price-asc',
  'price-desc',
  'duration-asc',
] as const;

export type PackageSort = (typeof PACKAGE_SORTS)[number];

export interface PackageCriteria {
  /** Free text: every word must appear in the name, description, a province or a service. */
  query?: string;
  /** Keep packages that visit at least one of these provinces. */
  provinces?: readonly string[];
  /** Keep packages whose length falls in at least one of these buckets. */
  durations?: readonly DurationBucketId[];
  minPrice?: number;
  maxPrice?: number;
  /** Keep packages whose every stay claims backup power. */
  backupPower?: boolean;
  sort?: PackageSort;
}

/** Lower-case and strip accents, so "vinales" finds "Viñales". */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** The provinces a package visits: its own, then its services', without repeats. */
export function packageProvinces(pkg: SearchablePackage): string[] {
  const provinces = [
    pkg.province,
    ...pkg.services.map((service) => service.itemProvince),
  ];
  return [...new Set(provinces.filter((value): value is string => Boolean(value)))];
}

export function durationBucket(days: number): DurationBucketId | null {
  return (
    DURATION_BUCKETS.find((bucket) => days >= bucket.min && days <= bucket.max)?.id ??
    null
  );
}

export function matchesQuery(pkg: SearchablePackage, query: string): boolean {
  const words = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return true;
  }
  const haystack = normalizeSearchText(
    [
      pkg.name,
      pkg.description ?? '',
      ...packageProvinces(pkg),
      ...pkg.services.map((service) => service.itemName),
    ].join(' '),
  );
  return words.every((word) => haystack.includes(word));
}

function price(pkg: SearchablePackage): number {
  return Number(pkg.basePrice);
}

/** Apply the criteria, then the sort; "recommended" keeps the catalogue's order. */
export function searchPackages<T extends SearchablePackage>(
  packages: readonly T[],
  criteria: PackageCriteria = {},
): T[] {
  const {
    query,
    provinces = [],
    durations = [],
    minPrice,
    maxPrice,
    backupPower,
  } = criteria;
  const kept = packages.filter((pkg) => {
    if (query && !matchesQuery(pkg, query)) {
      return false;
    }
    if (
      provinces.length > 0 &&
      !packageProvinces(pkg).some((province) => provinces.includes(province))
    ) {
      return false;
    }
    if (durations.length > 0) {
      const bucket = durationBucket(pkg.durationDays);
      if (!bucket || !durations.includes(bucket)) {
        return false;
      }
    }
    if (minPrice !== undefined && price(pkg) < minPrice) {
      return false;
    }
    if (maxPrice !== undefined && price(pkg) > maxPrice) {
      return false;
    }
    if (backupPower && !pkg.backupPower) {
      return false;
    }
    return true;
  });

  switch (criteria.sort ?? 'recommended') {
    case 'price-asc':
      return kept.sort((a, b) => price(a) - price(b));
    case 'price-desc':
      return kept.sort((a, b) => price(b) - price(a));
    case 'duration-asc':
      return kept.sort((a, b) => a.durationDays - b.durationDays);
    default:
      return kept;
  }
}

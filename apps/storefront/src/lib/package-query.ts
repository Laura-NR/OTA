import {
  DURATION_BUCKETS,
  PACKAGE_SORTS,
  type DurationBucketId,
  type PackageCriteria,
  type PackageSort,
} from '@ota/domain';

/** What the Packages URL carries: `?q=&province=&duration=&min=&max=&sort=`. */
export interface PackageQuery {
  query: string;
  provinces: string[];
  durations: DurationBucketId[];
  minPrice: number | null;
  maxPrice: number | null;
  sort: PackageSort;
}

type Params = Record<string, string | string[] | undefined>;

const list = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const amount = (value: string | string[] | undefined): number | null => {
  const [first] = list(value);
  const parsed = first === undefined || first === '' ? Number.NaN : Number(first);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const bucketIds: readonly string[] = DURATION_BUCKETS.map((bucket) => bucket.id);

/** Read the filters from the URL, dropping anything that is not one. */
export function parsePackageQuery(params: Params): PackageQuery {
  const [sort] = list(params.sort);
  return {
    query: list(params.q)[0]?.trim() ?? '',
    provinces: list(params.province).filter(Boolean),
    durations: list(params.duration).filter((value): value is DurationBucketId =>
      bucketIds.includes(value),
    ),
    minPrice: amount(params.min),
    maxPrice: amount(params.max),
    sort: (PACKAGE_SORTS as readonly string[]).includes(sort ?? '')
      ? (sort as PackageSort)
      : 'recommended',
  };
}

/** The URL query for a set of filters; defaults are left out. */
export function packageQueryString(query: PackageQuery): string {
  const params = new URLSearchParams();
  if (query.query) params.set('q', query.query);
  for (const province of query.provinces) params.append('province', province);
  for (const duration of query.durations) params.append('duration', duration);
  if (query.minPrice !== null) params.set('min', String(query.minPrice));
  if (query.maxPrice !== null) params.set('max', String(query.maxPrice));
  if (query.sort !== 'recommended') params.set('sort', query.sort);
  return params.toString();
}

export function toCriteria(query: PackageQuery): PackageCriteria {
  return {
    query: query.query || undefined,
    provinces: query.provinces,
    durations: query.durations,
    minPrice: query.minPrice ?? undefined,
    maxPrice: query.maxPrice ?? undefined,
    sort: query.sort,
  };
}

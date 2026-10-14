'use client';

import {
  DURATION_BUCKETS,
  PACKAGE_SORTS,
  packageProvinces,
  searchPackages,
  type DurationBucketId,
  type PackageSort,
} from '@ota/domain';
import type { PackageDto, PackagesContent } from '@ota/schemas';
import {
  Button,
  buttonClassName,
  cn,
  Drawer,
  FilterChip,
  Icon,
  Input,
  Select,
} from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { PackageCard } from '@/components/package-card';
import { Link, usePathname } from '@/i18n/navigation';
import { MAX_COMPARE, MIN_COMPARE } from '@/lib/compare-limits';
import { useCompareSelection } from '@/lib/compare-selection';
import { formatMoney } from '@/lib/format';
import { packageQueryString, toCriteria, type PackageQuery } from '@/lib/package-query';

const SORT_KEYS: Record<PackageSort, string> = {
  recommended: 'recommended',
  'price-asc': 'priceAsc',
  'price-desc': 'priceDesc',
  'duration-asc': 'durationAsc',
};

const EMPTY: Omit<PackageQuery, 'sort'> = {
  query: '',
  provinces: [],
  durations: [],
  minPrice: null,
  maxPrice: null,
};

/**
 * Packages (Packages / M-Packages boards): filters by province, length and
 * price, a sort, the active filters as removable chips, and a Compare box on
 * every card feeding the compare tray. Filtering runs here on the live
 * catalogue and the URL keeps up, so a filtered list can be shared. The
 * board's type, sleep, pace, conditions and impact filters need the package
 * model (M1) and are not drawn.
 */
export function PackagesBrowser({
  packages,
  initial,
  instant,
  custom,
}: {
  packages: readonly PackageDto[];
  initial: PackageQuery;
  instant: boolean;
  custom: PackagesContent['custom'] | null;
}) {
  const t = useTranslations('packages.browser');
  const locale = useLocale();
  const pathname = usePathname();
  const [query, setQuery] = useState(initial);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const compare = useCompareSelection();

  const shown = searchPackages(packages, toCriteria(query));
  const currency = packages[0]?.currency ?? 'EUR';
  const money = (value: number) => formatMoney(value, currency, locale);

  useEffect(() => {
    // Keep the URL in step without a server round trip.
    const search = packageQueryString(query);
    const url = `${window.location.pathname}${search ? `?${search}` : ''}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', url);
    }
  }, [query, pathname]);

  const provinceCounts = new Map<string, number>();
  for (const pkg of packages) {
    for (const province of packageProvinces(pkg)) {
      provinceCounts.set(province, (provinceCounts.get(province) ?? 0) + 1);
    }
  }
  const provinces = [...provinceCounts.keys()].sort((a, b) => a.localeCompare(b, locale));

  const toggleIn = <T,>(values: readonly T[], value: T): T[] =>
    values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

  const chips: { key: string; label: string; remove: () => void }[] = [
    ...(query.query
      ? [
          {
            key: 'q',
            label: t('queryChip', { query: query.query }),
            remove: () => setQuery({ ...query, query: '' }),
          },
        ]
      : []),
    ...query.provinces.map((province) => ({
      key: `province-${province}`,
      label: province,
      remove: () =>
        setQuery({
          ...query,
          provinces: query.provinces.filter((item) => item !== province),
        }),
    })),
    ...query.durations.map((duration) => ({
      key: `duration-${duration}`,
      label: t(`durations.${duration}`),
      remove: () =>
        setQuery({
          ...query,
          durations: query.durations.filter((item) => item !== duration),
        }),
    })),
    ...(query.minPrice !== null || query.maxPrice !== null
      ? [
          {
            key: 'price',
            label:
              query.minPrice !== null && query.maxPrice !== null
                ? `${money(query.minPrice)}–${money(query.maxPrice)}`
                : query.minPrice !== null
                  ? t('priceFrom', { price: money(query.minPrice) })
                  : t('priceTo', { price: money(query.maxPrice ?? 0) }),
            remove: () => setQuery({ ...query, minPrice: null, maxPrice: null }),
          },
        ]
      : []),
  ];
  const clearAll = () => setQuery({ ...EMPTY, sort: query.sort });
  const picked = packages.filter((pkg) => compare.selected.includes(pkg.slug));

  // Rendered twice (the aside from `lg`, the drawer below it), so ids take a prefix.
  const filters = (prefix: string) => (
    <div className="flex flex-col divide-y">
      <div
        role="group"
        aria-labelledby={`${prefix}-where`}
        className="flex flex-col pb-4"
      >
        <p id={`${prefix}-where`} className="pb-1 text-body font-semibold text-default">
          {t('where')}
        </p>
        {provinces.map((province) => (
          <label
            key={province}
            className="flex min-h-touch cursor-pointer items-center gap-3 text-body text-default"
          >
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-primary-600"
              checked={query.provinces.includes(province)}
              onChange={() =>
                setQuery({ ...query, provinces: toggleIn(query.provinces, province) })
              }
            />
            <span className="flex-1">{province}</span>
            <span className="text-caption text-muted">
              {provinceCounts.get(province)}
            </span>
          </label>
        ))}
      </div>
      <div
        role="group"
        aria-labelledby={`${prefix}-duration`}
        className="flex flex-col gap-3 py-4"
      >
        <p id={`${prefix}-duration`} className="text-body font-semibold text-default">
          {t('duration')}
        </p>
        <div className="flex flex-wrap gap-2">
          {DURATION_BUCKETS.map((bucket) => {
            const on = query.durations.includes(bucket.id);
            return (
              <button
                key={bucket.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setQuery({
                    ...query,
                    durations: toggleIn<DurationBucketId>(query.durations, bucket.id),
                  })
                }
                className={cn(
                  'h-10 rounded-full border px-4 text-body transition-colors',
                  on
                    ? 'border-primary-600 bg-action-primary text-on-primary'
                    : 'border-input bg-surface text-default hover:bg-neutral-100',
                )}
              >
                {t(`durations.${bucket.id}`)}
              </button>
            );
          })}
        </div>
      </div>
      <div
        role="group"
        aria-labelledby={`${prefix}-price`}
        className="flex flex-col gap-2 pt-4"
      >
        <p id={`${prefix}-price`} className="text-body font-semibold text-default">
          {t('price')}
        </p>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <label className="flex flex-col gap-1 text-caption text-muted">
            {t('min')}
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={query.minPrice ?? ''}
              onChange={(event) =>
                setQuery({
                  ...query,
                  minPrice: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            />
          </label>
          <span aria-hidden="true" className="pb-2 text-muted">
            –
          </span>
          <label className="flex flex-col gap-1 text-caption text-muted">
            {t('max')}
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={query.maxPrice ?? ''}
              onChange={(event) =>
                setQuery({
                  ...query,
                  maxPrice: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            />
          </label>
        </div>
        <p className="text-caption text-muted">{t('priceNote', { currency })}</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="secondary"
          className="lg:hidden"
          onClick={() => setFiltersOpen(true)}
          aria-haspopup="dialog"
        >
          <Icon name="sliders" />
          {t('filters')}
          {chips.length > 0 ? ` · ${chips.length}` : ''}
        </Button>
        <label className="ml-auto flex items-center gap-3 text-body-sm text-secondary">
          {t('sortBy')}
          <Select
            className="w-56"
            value={query.sort}
            onChange={(event) =>
              setQuery({ ...query, sort: event.target.value as PackageSort })
            }
          >
            {PACKAGE_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {t(`sorts.${SORT_KEYS[sort]}`)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <Drawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('filters')}
        closeLabel={t('closeFilters')}
      >
        <div className="flex flex-col gap-4">
          {filters('drawer-filter')}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
              {t('show', { count: shown.length })}
            </Button>
            <Button variant="tertiary" onClick={clearAll}>
              {t('clearAll')}
            </Button>
          </div>
        </div>
      </Drawer>

      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <section
          aria-labelledby="filters-title"
          className="hidden flex-col gap-3 rounded-lg border bg-surface p-5 lg:flex"
        >
          <div className="flex items-center justify-between gap-3 border-b pb-3">
            <h2 id="filters-title" className="text-h4 text-default">
              {t('filters')}
            </h2>
            {chips.length > 0 ? (
              <Button variant="tertiary" size="sm" onClick={clearAll}>
                {t('clearAll')}
              </Button>
            ) : null}
          </div>
          {filters('filter')}
        </section>

        <section aria-labelledby="results-title" className="flex min-w-0 flex-col gap-5">
          <h2 id="results-title" className="sr-only">
            {t('results')}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <FilterChip
                key={chip.key}
                onRemove={chip.remove}
                removeLabel={t('removeFilter', { label: chip.label })}
              >
                {chip.label}
              </FilterChip>
            ))}
            {chips.length > 0 ? (
              <Button variant="tertiary" size="sm" onClick={clearAll}>
                {t('clearAll')}
              </Button>
            ) : null}
            <p role="status" className="ml-auto text-body-sm text-secondary">
              {t('showing', { shown: shown.length, total: packages.length })}
            </p>
          </div>

          {shown.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
              <p className="text-body text-secondary">{t('empty')}</p>
              <Button variant="secondary" onClick={clearAll}>
                {t('clearAll')}
              </Button>
            </div>
          ) : (
            <ul className="grid gap-6 xl:grid-cols-2">
              {shown.map((pkg) => {
                const on = compare.selected.includes(pkg.slug);
                const full = !on && compare.selected.length >= MAX_COMPARE;
                return (
                  <li key={pkg.id} className="flex min-w-0">
                    <PackageCard
                      pkg={pkg}
                      instant={instant}
                      compare={
                        <label
                          className={cn(
                            buttonClassName({ variant: 'secondary' }),
                            'cursor-pointer gap-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60',
                            on && 'border-primary-600 bg-primary-50',
                          )}
                          title={
                            full ? t('compareFull', { max: MAX_COMPARE }) : undefined
                          }
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-primary-600"
                            checked={on}
                            disabled={full}
                            onChange={() => compare.toggle(pkg.slug)}
                          />
                          {t('compare')}
                          <span className="sr-only"> {pkg.name}</span>
                        </label>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}

          {custom ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border bg-surface p-6">
              {custom.eyebrow ? (
                <p className="text-overline uppercase text-secondary-600">
                  {custom.eyebrow}
                </p>
              ) : null}
              <p className="text-h4 text-default">{custom.text}</p>
              <Link href="/custom" className={buttonClassName({ variant: 'secondary' })}>
                {custom.cta}
              </Link>
            </div>
          ) : null}
        </section>
      </div>

      {picked.length > 0 ? (
        // Room under the last card for the fixed tray.
        <div aria-hidden="true" className="h-16" />
      ) : null}
      {picked.length > 0 ? (
        <section
          aria-label={t('trayLabel')}
          className="fixed inset-x-0 bottom-16 z-20 bg-neutral-900 text-neutral-0 md:bottom-0"
        >
          <div className="mx-auto flex max-w-container flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 md:px-8 lg:px-10">
            <p className="text-body font-semibold">
              {t('trayTitle', { count: picked.length })}
            </p>
            <p className="hidden min-w-0 flex-1 truncate text-body-sm text-neutral-200 md:block">
              {picked.map((pkg) => pkg.name).join(' · ')}
            </p>
            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={compare.clear}
                className="font-semibold text-accent-500 underline-offset-[3px] hover:underline focus-visible:outline-accent-500"
              >
                {t('trayClear')}
              </button>
              {picked.length >= MIN_COMPARE ? (
                <Link
                  href={`/packages/compare?trips=${picked.map((pkg) => pkg.slug).join(',')}`}
                  className={cn(
                    buttonClassName(),
                    'bg-accent-500 text-neutral-900 hover:bg-accent-600 focus-visible:outline-accent-500',
                  )}
                >
                  {t('trayGo')}
                </Link>
              ) : (
                <span className="text-body-sm text-neutral-200">
                  {t('trayHint', { min: MIN_COMPARE })}
                </span>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

'use client';

import { Button, buttonClassName, Checkbox, cn, Icon } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Link, useRouter } from '@/i18n/navigation';
import { MAX_COMPARE } from '@/lib/compare-limits';
import { useCompareSelection } from '@/lib/compare-selection';

export interface CompareTrip {
  slug: string;
  name: string;
  length: string;
  price: string;
  mediaId: string | null;
}

export interface CompareRow {
  key: string;
  label: string;
  values: string[];
}

/**
 * The Compare table (Compare / M-Compare boards): one column per trip with the
 * attribute column fixed while a phone swipes sideways, a switch that dims rows
 * where every trip says the same, removal per column and a shareable link.
 */
export function CompareView({
  trips,
  rows,
}: {
  trips: CompareTrip[];
  rows: CompareRow[];
}) {
  const t = useTranslations('compare');
  const router = useRouter();
  const compare = useCompareSelection();
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const [shared, setShared] = useState<'copied' | 'failed' | null>(null);
  const slugs = trips.map((trip) => trip.slug).join(',');

  useEffect(() => {
    // The listing's tray shows what is on this page.
    compare.set(slugs ? slugs.split(',') : []);
  }, [slugs, compare.set]);

  function remove(slug: string) {
    const rest = trips.filter((trip) => trip.slug !== slug).map((trip) => trip.slug);
    compare.set(rest);
    router.replace(
      rest.length > 0 ? `/packages/compare?trips=${rest.join(',')}` : '/packages/compare',
    );
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShared('copied');
    } catch {
      setShared('failed');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-4">
        <Checkbox
          label={t('highlight')}
          checked={differencesOnly}
          onChange={(event) => setDifferencesOnly(event.target.checked)}
        />
        <Button variant="secondary" onClick={share}>
          <Icon name="share" />
          {t('share')}
        </Button>
        <p role="status" className="text-body-sm text-secondary empty:hidden">
          {shared === 'copied' ? t('copied') : shared === 'failed' ? t('copyFailed') : ''}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-surface">
        <table className="w-max min-w-full table-fixed border-collapse text-left">
          <caption className="sr-only">{t('caption')}</caption>
          <thead>
            <tr>
              <td className="sticky left-0 z-10 w-36 bg-sunken p-4 align-bottom text-caption text-muted md:w-56">
                {t('count', { count: trips.length, max: MAX_COMPARE })}
              </td>
              {trips.map((trip) => (
                <th
                  key={trip.slug}
                  scope="col"
                  className="w-[200px] p-4 align-top font-normal md:w-[260px]"
                >
                  <div className="flex flex-col gap-2">
                    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-md bg-sunken text-muted">
                      {trip.mediaId ? (
                        <img
                          src={`/api/ota/catalog/media/${trip.mediaId}`}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <Icon name="image" />
                      )}
                      <Button
                        variant="secondary"
                        size="icon"
                        aria-label={t('remove', { name: trip.name })}
                        onClick={() => remove(trip.slug)}
                        className="absolute right-2 top-2 h-9 w-9 rounded-full border-transparent"
                      >
                        <Icon name="x" />
                      </Button>
                    </div>
                    <p className="text-overline uppercase text-muted">{trip.length}</p>
                    <p className="font-display text-h2-compact text-default">
                      {trip.name}
                    </p>
                    <p className="text-h4 font-bold text-default">{trip.price}</p>
                    <Link href={`/packages/${trip.slug}`} className={buttonClassName()}>
                      {t('request')}
                    </Link>
                  </div>
                </th>
              ))}
              {trips.length < MAX_COMPARE ? (
                <td className="w-[180px] p-4 align-top">
                  <Link
                    href="/packages"
                    className="flex aspect-video flex-col items-center justify-center gap-1 rounded-md border border-dashed text-primary-600 hover:bg-primary-50"
                  >
                    <Icon name="plus" />
                    <span className="font-semibold">{t('addTrip')}</span>
                    <span className="text-caption text-muted">
                      {t('upTo', { max: MAX_COMPARE })}
                    </span>
                  </Link>
                </td>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const same = row.values.every((value) => value === row.values[0]);
              return (
                <tr
                  key={row.key}
                  className={cn('border-t', differencesOnly && same && 'opacity-50')}
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-sunken p-4 text-left align-top text-body-sm font-semibold text-secondary"
                  >
                    {row.label}
                  </th>
                  {row.values.map((value, index) => (
                    <td
                      key={trips[index]?.slug ?? index}
                      className="p-4 align-top text-body-sm text-default"
                    >
                      {value}
                    </td>
                  ))}
                  {trips.length < MAX_COMPARE ? <td /> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-caption text-muted">{t('note')}</p>
    </div>
  );
}

/**
 * An empty Compare (no `?trips=`) picks up the trips chosen while browsing, so
 * "Compare" links elsewhere on the site land on the selection.
 */
export function CompareFromSelection() {
  const router = useRouter();
  const compare = useCompareSelection();

  useEffect(() => {
    if (compare.selected.length > 0) {
      router.replace(`/packages/compare?trips=${compare.selected.join(',')}`);
    }
  }, [compare.selected, router]);

  return null;
}

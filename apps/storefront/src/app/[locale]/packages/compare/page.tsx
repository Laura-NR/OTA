import { isFeatureEnabled } from '@ota/config';
import { packageProvinces } from '@ota/domain';
import { packagesContentSchema, type PackageDto } from '@ota/schemas';
import { buttonClassName } from '@ota/ui';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { Breadcrumb } from '@/components/breadcrumb';
import { packageMediaId } from '@/components/package-card';
import {
  CompareFromSelection,
  CompareView,
  type CompareRow,
} from '@/components/packages/compare-view';
import { Link } from '@/i18n/navigation';
import { MAX_COMPARE } from '@/lib/compare-limits';
import { getPageContent } from '@/lib/content';
import { formatMoney } from '@/lib/format';
import { getPackages } from '@/lib/packages';
import { getTenantConfig } from '@/lib/tenant';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('compare');
  return { title: t('title') };
}

/**
 * Compare (Compare / M-Compare boards): two to four trips from `?trips=` (slugs,
 * in order), side by side on the facts the catalogue has today: booking model,
 * length, provinces, stays, transport, experiences and price. The board's
 * group size, meals, pace, reviews and policy rows wait for the package model
 * (M1) and are not drawn.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ trips?: string }>;
}) {
  const tenant = getTenantConfig();
  const locale = await getLocale();
  const [{ trips: wanted = '' }, packages, content, t, tp, nav] = await Promise.all([
    searchParams,
    getPackages(),
    getPageContent('packages', packagesContentSchema),
    getTranslations('compare'),
    getTranslations('packages'),
    getTranslations('nav'),
  ]);
  const trips = wanted
    .split(',')
    .map((slug) => packages.find((pkg) => pkg.slug === slug))
    .filter((pkg): pkg is PackageDto => Boolean(pkg))
    .slice(0, MAX_COMPARE);
  const builder = isFeatureEnabled(tenant, 'customItineraryBuilder');
  const whatsapp = tenant.branding.whatsappNumber;

  const length = (days: number) =>
    days > 1
      ? `${tp('days', { count: days })} · ${tp('nights', { count: days - 1 })}`
      : tp('days', { count: days });
  // A stay of several nights lists its casa once per night; name it once.
  const services = (pkg: PackageDto, type: string) =>
    [
      ...new Set(
        pkg.services
          .filter((service) => service.itemType === type)
          .map((service) => service.itemName),
      ),
    ].join(' · ') || '—';
  const rows: CompareRow[] = [
    {
      key: 'booking',
      label: t('rows.booking'),
      values: trips.map(() =>
        isFeatureEnabled(tenant, 'instantBooking')
          ? tp('instantPill')
          : tp('requestPill'),
      ),
    },
    {
      key: 'duration',
      label: t('rows.duration'),
      values: trips.map((pkg) => length(pkg.durationDays)),
    },
    {
      key: 'where',
      label: t('rows.where'),
      values: trips.map((pkg) => packageProvinces(pkg).join(' · ') || '—'),
    },
    {
      key: 'sleep',
      label: t('rows.sleep'),
      values: trips.map((pkg) => services(pkg, 'ACCOMMODATION')),
    },
    {
      key: 'transport',
      label: t('rows.transport'),
      values: trips.map((pkg) => services(pkg, 'TRANSPORT')),
    },
    {
      key: 'experiences',
      label: t('rows.experiences'),
      values: trips.map((pkg) => services(pkg, 'EXPERIENCE')),
    },
    {
      key: 'price',
      label: t('rows.price'),
      values: trips.map((pkg) =>
        t('from', { price: formatMoney(pkg.basePrice, pkg.currency, locale) }),
      ),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-container flex-col gap-8 px-6 py-8 md:px-8 lg:px-10">
      <Breadcrumb
        label={tp('breadcrumb')}
        items={[
          { label: nav('home'), href: '/' },
          { label: nav('packages'), href: '/packages' },
          { label: t('breadcrumb') },
        ]}
      />
      <header className="flex flex-col gap-3">
        <h1 className="text-h1-compact text-default md:text-h1">{t('title')}</h1>
        <p className="max-w-prose text-body-lg text-secondary">{t('lede')}</p>
      </header>

      {trips.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-8">
          {wanted ? null : <CompareFromSelection />}
          <h2 className="text-h4 text-default">{t('emptyTitle')}</h2>
          <p className="max-w-prose text-body text-secondary">
            {t('emptyText', { min: 2, max: MAX_COMPARE })}
          </p>
          <Link href="/packages" className={buttonClassName()}>
            {t('browse')}
          </Link>
        </div>
      ) : (
        <CompareView
          trips={trips.map((pkg) => ({
            slug: pkg.slug,
            name: pkg.name,
            length: length(pkg.durationDays),
            price: formatMoney(pkg.basePrice, pkg.currency, locale),
            mediaId: packageMediaId(pkg),
          }))}
          rows={rows}
        />
      )}

      {content?.compare && (whatsapp || builder) ? (
        <section className="flex flex-col items-start gap-3 rounded-lg border bg-surface p-6">
          {content.compare.eyebrow ? (
            <p className="text-overline uppercase text-secondary-600">
              {content.compare.eyebrow}
            </p>
          ) : null}
          <p className="text-h4 text-default">{content.compare.text}</p>
          <div className="flex flex-wrap gap-3">
            {whatsapp ? (
              <a
                href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
                className={buttonClassName({ variant: 'secondary' })}
              >
                {t('whatsapp')}
              </a>
            ) : null}
            {builder ? (
              <Link href="/custom" className={buttonClassName({ variant: 'secondary' })}>
                {t('mix')}
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

import { isFeatureEnabled } from '@ota/config';
import { packageProvinces } from '@ota/domain';
import { destinationsContentSchema, type PackageDto } from '@ota/schemas';
import { Badge, cn, Icon } from '@ota/ui';
import type { BadgeVariant } from '@ota/ui';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Breadcrumb } from '@/components/breadcrumb';
import { PackageBookingForm } from '@/components/package-booking-form';
import { BookingModelPill, PackageCard } from '@/components/package-card';
import { PackageActions, PackageTabs } from '@/components/packages/package-actions';
import { SectionHead } from '@/components/section-head';
import { Link, permanentRedirect } from '@/i18n/navigation';
import { getServerSession } from '@/lib/api';
import { getPageContent } from '@/lib/content';
import { formatMoney } from '@/lib/format';
import { buildProvinceViews, getGeography, provinceCode } from '@/lib/geography';
import { getPackage, getPackages } from '@/lib/packages';
import { getTenantConfig } from '@/lib/tenant';

const wrap = 'mx-auto w-full max-w-container px-6 md:px-8 lg:px-10';

/** How many other trips "Pairs well with" suggests. */
const PAIRINGS = 2;

/** How many photo slots the gallery draws (one large, four small). */
const GALLERY = 5;

const SERVICE_TYPES = ['ACCOMMODATION', 'TRANSPORT', 'EXPERIENCE'] as const;

const LEVEL_BADGES: Record<1 | 2 | 3, BadgeVariant> = {
  1: 'success',
  2: 'info',
  3: 'warning',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const pkg = await getPackage((await params).slug);
  return { title: pkg?.name };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** A departure date (stored at UTC midnight) in the visitor's language. */
function departureDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

/**
 * A curated package (Package / M-Package boards): its length, provinces and
 * services, photos from the catalogue, the conditions of the provinces it
 * visits, and the sticky request summary. M1 adds the day texts, the
 * accommodation tiers, the departures and the optional extras. Reviews and the
 * FAQ are still not drawn.
 */
export default async function PackageDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [pkg, packages, session, places, locale, t, tc, nav, common] = await Promise.all([
    getPackage(slug),
    getPackages(),
    getServerSession(),
    getPageContent('destinations', destinationsContentSchema),
    getLocale(),
    getTranslations('packages'),
    getTranslations('catalog'),
    getTranslations('nav'),
    getTranslations('pages.common'),
  ]);
  if (!pkg) {
    notFound();
  }
  // A retired slug resolves to its package (the API follows the redirect); send
  // the visitor to the current slug with a 308.
  if (pkg.slug !== slug) {
    permanentRedirect({ href: `/packages/${pkg.slug}`, locale });
  }
  const tenant = getTenantConfig();
  const instant = isFeatureEnabled(tenant, 'instantBooking');
  const builder = isFeatureEnabled(tenant, 'customItineraryBuilder');
  const provinces = packageProvinces(pkg);
  const nights = pkg.durationDays - 1;
  const length =
    nights > 0
      ? `${t('days', { count: pkg.durationDays })} · ${t('nights', { count: nights })}`
      : t('days', { count: pkg.durationDays });
  const gallery =
    pkg.media.length > 0
      ? pkg.media.slice(0, GALLERY).map((item) => ({
          id: item.id,
          alt: item.altText,
          url: `/api/ota/catalog/packages/media/${item.id}`,
        }))
      : unique(
          pkg.services.flatMap((service) =>
            service.itemMediaId ? [service.itemMediaId] : [],
          ),
        )
          .slice(0, GALLERY)
          .map((mediaId) => ({
            id: mediaId,
            alt: '',
            url: `/api/ota/catalog/media/${mediaId}`,
          }));
  const days = unique([
    ...pkg.services.map((service) => String(service.dayOffset)),
    ...pkg.days.map((day) => String(day.dayOffset)),
  ])
    .map(Number)
    .sort((a, b) => a - b);
  const byType = (type: string) =>
    unique(
      pkg.services
        .filter((service) => service.itemType === type)
        .map((service) => service.itemName),
    );

  const geography = getGeography();
  const conditions =
    geography && places
      ? buildProvinceViews(geography, places).filter((province) =>
          provinces.some((name) => provinceCode(name) === province.code),
        )
      : [];
  const cuts = (min: number, max: number | null) =>
    max === null
      ? t('detail.hoursOpen', { min })
      : max === min
        ? t('detail.hoursSingle', { min })
        : t('detail.hoursRange', { min, max });
  const pairings = packages
    .filter((other: PackageDto) => other.slug !== pkg.slug)
    .slice(0, PAIRINGS);

  const tabs = [
    {
      id: 'overview',
      label: t('detail.tabs.overview'),
      panel: (
        <div className="flex flex-col gap-8 pt-6">
          {pkg.description ? (
            <p className="max-w-[68ch] text-body-lg text-secondary">{pkg.description}</p>
          ) : null}
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: t('detail.facts.length'), value: length },
              {
                label: t('detail.facts.provinces'),
                value: provinces.join(' · ') || 'Cuba',
              },
              {
                label: t('detail.facts.stays'),
                value: byType('ACCOMMODATION').length
                  ? t('detail.facts.staysValue', {
                      count: byType('ACCOMMODATION').length,
                    })
                  : '—',
              },
              {
                label: t('detail.facts.booking'),
                value: instant ? t('instantPill') : t('requestPill'),
              },
            ].map((fact) => (
              <div
                key={fact.label}
                className="flex flex-col gap-0.5 rounded-lg border bg-surface p-4"
              >
                <dt className="text-caption text-muted">{fact.label}</dt>
                <dd className="text-body font-semibold text-default">{fact.value}</dd>
              </div>
            ))}
          </dl>
          {pkg.services.length > 0 ? (
            <section aria-labelledby="highlights-title" className="flex flex-col gap-3">
              <h2 id="highlights-title" className="text-h3 text-default">
                {t('detail.highlights')}
              </h2>
              <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {unique(pkg.services.map((service) => service.itemName)).map((name) => (
                  <li key={name} className="flex gap-2 text-body text-secondary">
                    <Icon name="check" className="mt-1 h-4 w-4 text-success-600" />
                    {name}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {pkg.tiers.length > 0 ? (
            <section aria-labelledby="tiers-title" className="flex flex-col gap-3">
              <h2 id="tiers-title" className="text-h3 text-default">
                {t('detail.tiers')}
              </h2>
              <ul className="flex flex-col gap-2">
                {pkg.tiers.map((tier) => (
                  <li
                    key={tier.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border bg-surface px-4 py-3 text-body"
                  >
                    <span className="font-medium text-default">{tier.name}</span>
                    <span className="text-body-sm text-secondary">
                      {Number(tier.priceDelta) === 0
                        ? t('detail.tiersBase')
                        : t('detail.tierDelta', {
                            delta: formatMoney(tier.priceDelta, pkg.currency, locale),
                          })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {pkg.departures.length > 0 ? (
            <section aria-labelledby="departures-title" className="flex flex-col gap-3">
              <h2 id="departures-title" className="text-h3 text-default">
                {t('detail.departures')}
              </h2>
              <ul className="flex flex-col gap-2">
                {pkg.departures.map((departure) => (
                  <li
                    key={departure.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border bg-surface px-4 py-3 text-body"
                  >
                    <span className="font-medium text-default">
                      {departureDate(departure.startDate, locale)}
                    </span>
                    <span className="text-body-sm text-secondary">
                      {t('detail.departureSeats', { count: departure.capacity })} ·{' '}
                      {t('detail.departureFrom', {
                        price: formatMoney(
                          departure.price ?? pkg.basePrice,
                          pkg.currency,
                          locale,
                        ),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {pkg.extras.filter((extra) => extra.active).length > 0 ? (
            <section aria-labelledby="extras-title" className="flex flex-col gap-3">
              <h2 id="extras-title" className="text-h3 text-default">
                {t('detail.extras')}
              </h2>
              <ul className="flex flex-col gap-2">
                {pkg.extras
                  .filter((extra) => extra.active)
                  .map((extra) => (
                    <li
                      key={extra.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border bg-surface px-4 py-3 text-body"
                    >
                      <span className="font-medium text-default">{extra.name}</span>
                      <span className="text-body-sm text-secondary">
                        {formatMoney(extra.price, pkg.currency, locale)} ·{' '}
                        {extra.priceUnit === 'PER_PERSON'
                          ? t('detail.extraPerPerson')
                          : t('detail.extraPerBooking')}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </div>
      ),
    },
    {
      id: 'itinerary',
      label: t('detail.tabs.itinerary'),
      panel: (
        <ol className="flex flex-col gap-4 pt-6">
          {days.map((day) => {
            const info = pkg.days.find((entry) => entry.dayOffset === day);
            return (
              <li key={day} className="flex gap-4 rounded-lg border bg-surface p-5">
                <span className="w-16 shrink-0 text-overline uppercase text-secondary-600">
                  {t('day', { day: day + 1 })}
                </span>
                <div className="flex flex-1 flex-col gap-2">
                  {info ? (
                    <>
                      <span className="text-body font-medium text-default">
                        {info.title}
                      </span>
                      {info.body ? (
                        <p className="text-body-sm text-secondary">{info.body}</p>
                      ) : null}
                    </>
                  ) : null}
                  <ul className="flex flex-col gap-2">
                    {pkg.services
                      .filter((service) => service.dayOffset === day)
                      .map((service) => (
                        <li
                          key={service.id}
                          className="flex flex-wrap justify-between gap-x-3 text-body"
                        >
                          <span className="font-medium text-default">
                            {service.itemName}
                          </span>
                          <span className="text-body-sm text-muted">
                            {[tc(`types.${service.itemType}`), service.itemProvince]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </li>
                      ))}
                  </ul>
                  {info?.meals ? (
                    <p className="text-caption text-muted">{info.meals}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ),
    },
    {
      id: 'included',
      label: t('detail.tabs.included'),
      panel: (
        <div className="grid gap-6 pt-6 md:grid-cols-3">
          {SERVICE_TYPES.map((type) => (
            <section key={type} className="flex flex-col gap-2">
              <h2 className="text-h4 text-default">{tc(`types.${type}`)}</h2>
              {byType(type).length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {byType(type).map((name) => (
                    <li key={name} className="flex gap-2 text-body-sm text-secondary">
                      <Icon name="check" className="mt-0.5 h-4 w-4 text-success-600" />
                      {name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-sm text-muted">{t('detail.notIncluded')}</p>
              )}
            </section>
          ))}
        </div>
      ),
    },
    ...(conditions.length > 0
      ? [
          {
            id: 'conditions',
            label: t('detail.tabs.conditions'),
            panel: (
              <ul className="flex flex-col gap-3 pt-6">
                {conditions.map((province) => (
                  <li
                    key={province.code}
                    className="flex flex-col gap-2 rounded-lg border bg-surface p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-h4 text-default">{province.name}</h2>
                      <Badge variant={LEVEL_BADGES[province.advisoryLevel]}>
                        {t('detail.level', { level: province.advisoryLevel })}
                      </Badge>
                    </div>
                    {province.summary ? (
                      <p className="text-body-sm text-secondary">{province.summary}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="warning">
                        <Icon name="zap" className="h-3.5 w-3.5" />
                        {t('detail.cuts', {
                          hours: cuts(province.powerCuts.min, province.powerCuts.max),
                        })}
                      </Badge>
                      <Badge variant={province.fuel === 'ok' ? 'success' : 'warning'}>
                        <Icon name="fuel" className="h-3.5 w-3.5" />
                        {t(`detail.fuel.${province.fuel}`)}
                      </Badge>
                    </div>
                  </li>
                ))}
                <li className="text-caption text-muted">
                  <Link href="/travel-info" className="underline underline-offset-[3px]">
                    {t('detail.conditionsLink')}
                  </Link>
                </li>
              </ul>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-10 pb-20 pt-6">
      <div className={cn(wrap, 'flex flex-col gap-4')}>
        <Breadcrumb
          label={t('breadcrumb')}
          items={[
            { label: nav('home'), href: '/' },
            { label: nav('packages'), href: '/packages' },
            { label: pkg.name },
          ]}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-overline uppercase text-secondary-600">{length}</p>
            <h1 className="text-h1 text-default md:text-display-2">{pkg.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body-sm text-secondary">
              <span className="flex items-center gap-1.5">
                <Icon name="map-pin" className="h-4 w-4" />
                {provinces.join(' · ') || 'Cuba'}
              </span>
              <BookingModelPill instant={instant} />
            </div>
          </div>
          <PackageActions slug={pkg.slug} name={pkg.name} />
        </div>
      </div>

      <div className={cn(wrap, 'grid gap-3 md:grid-cols-[2fr_1fr_1fr] md:grid-rows-2')}>
        {Array.from({ length: GALLERY }, (_, index) => {
          const photo = gallery[index];
          return (
            <div
              key={index}
              className={cn(
                'relative flex items-center justify-center overflow-hidden rounded-lg bg-sunken text-muted',
                index === 0
                  ? 'aspect-video md:row-span-2 md:aspect-auto'
                  : 'hidden aspect-[4/3] md:flex',
              )}
            >
              {photo ? (
                <img
                  src={photo.url}
                  alt={photo.alt}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <span className="flex items-center gap-2 text-body-sm">
                  <Icon name="image" />
                  {index === 0 ? common('photoToCome') : null}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div
        className={cn(wrap, 'grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_380px]')}
      >
        <div className="min-w-0">
          <PackageTabs items={tabs} label={t('detail.tabsLabel')} />
        </div>
        <PackageBookingForm
          slug={pkg.slug}
          signedIn={Boolean(session)}
          price={formatMoney(pkg.basePrice, pkg.currency, locale)}
          instant={instant}
          supportPhone={tenant.branding.supportPhone ?? null}
        />
      </div>

      {pairings.length > 0 || builder ? (
        <section
          aria-labelledby="pairs-title"
          className={cn(wrap, 'flex flex-col gap-6')}
        >
          <SectionHead
            id="pairs-title"
            eyebrow={t('detail.pairsEyebrow')}
            title={t('detail.pairsTitle')}
          />
          <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {pairings.map((other) => (
              <li key={other.id} className="flex min-w-0">
                <PackageCard pkg={other} instant={instant} />
              </li>
            ))}
            {builder ? (
              <li className="flex min-w-0">
                <Link
                  href="/custom"
                  className="flex w-full flex-col gap-2 rounded-lg border border-dashed bg-surface p-6 transition hover:shadow-md"
                >
                  <Icon name="plus" className="h-8 w-8 text-secondary-600" />
                  <span className="text-overline uppercase text-muted">
                    {t('detail.customEyebrow')}
                  </span>
                  <span className="text-h4 text-default">{t('detail.customTitle')}</span>
                  <span className="text-body-sm text-secondary">
                    {t('detail.customText')}
                  </span>
                  <span className="font-semibold text-primary-600">
                    {t('detail.customCta')}
                  </span>
                </Link>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

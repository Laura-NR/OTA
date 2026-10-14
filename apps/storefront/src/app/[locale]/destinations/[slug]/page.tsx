import { isFeatureEnabled } from '@ota/config';
import { destinationsContentSchema, type ConditionTopic } from '@ota/schemas';
import {
  AccordionItem,
  Alert,
  Badge,
  buttonClassName,
  cn,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import type { BadgeVariant, IconName } from '@ota/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Breadcrumb } from '@/components/breadcrumb';
import { CatalogItemCard } from '@/components/catalog-item-card';
import { TONE_BADGES } from '@/components/conditions-card';
import { PackageCard } from '@/components/package-card';
import { ArrowLink, SectionHead } from '@/components/section-head';
import { Link } from '@/i18n/navigation';
import { getCatalog } from '@/lib/catalog';
import { getPageContent } from '@/lib/content';
import { buildDestinationViews, buildProvinceViews, getGeography } from '@/lib/geography';
import { getPackages } from '@/lib/packages';
import { getTenantConfig } from '@/lib/tenant';

const wrap = 'mx-auto w-full max-w-container px-6 md:px-8 lg:px-10';

/** A long destination name must not push a hero button off a phone screen. */
const wrapButton = 'h-auto min-h-12 whitespace-normal py-2 text-center';

const TOPIC_ICONS: Record<ConditionTopic, IconName> = {
  power: 'zap',
  fuel: 'fuel',
  connectivity: 'wifi',
  advisories: 'shield',
  weather: 'cloud-sun',
  roads: 'route',
};

const NETWORK_BADGES: Record<'active' | 'limited' | 'none', BadgeVariant> = {
  active: 'success',
  limited: 'warning',
  none: 'secondary',
};

const LEVEL_BADGES: Record<1 | 2 | 3, BadgeVariant> = {
  1: 'success',
  2: 'info',
  3: 'warning',
};

async function load(slug: string) {
  const geography = getGeography();
  const [content, packages] = await Promise.all([
    getPageContent('destinations', destinationsContentSchema),
    getPackages(),
  ]);
  if (!geography || !content) {
    return null;
  }
  const destination = buildDestinationViews(geography, content, packages).find(
    (item) => item.slug === slug,
  );
  const province = buildProvinceViews(geography, content).find(
    (item) => item.code === destination?.province,
  );
  if (!destination || !province) {
    return null;
  }
  return {
    content,
    destination,
    province,
    detail: content.details[slug],
    status:
      content.status === 'published' && geography.status === 'published'
        ? ('published' as const)
        : ('placeholder' as const),
    trips: packages.filter((pkg) => destination.packages.includes(pkg.slug)),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const data = await load((await params).slug);
  return { title: data?.destination.name };
}

/**
 * A destination (Destination board): the tenant's words where it has written
 * them (overview, conditions, getting there, FAQ) and live data for the rest —
 * the province's network and conditions from the destination data, its
 * experiences and stays from the catalogue, and the trips that sleep here.
 * Hosts' portraits wait for written consent and the 30-day power history for
 * a conditions feed (A-Content), so neither is drawn.
 */
export default async function DestinationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const data = await load((await params).slug);
  if (!data) {
    notFound();
  }
  const { destination, province, detail, trips } = data;
  const tenant = getTenantConfig();
  const builder = isFeatureEnabled(tenant, 'customItineraryBuilder');
  const instant = isFeatureEnabled(tenant, 'instantBooking');
  const [t, nav, common, experiences, stays] = await Promise.all([
    getTranslations('destinations'),
    getTranslations('nav'),
    getTranslations('pages.common'),
    getCatalog({ type: 'EXPERIENCE', province: province.name }),
    getCatalog({ type: 'ACCOMMODATION', province: province.name }),
  ]);
  const hours =
    province.powerCuts.max === null
      ? t('hours.open', { min: province.powerCuts.min })
      : province.powerCuts.max === province.powerCuts.min
        ? t('hours.single', { min: province.powerCuts.min })
        : t('hours.range', { min: province.powerCuts.min, max: province.powerCuts.max });
  const distance =
    province.kmFromHavana === 0
      ? null
      : t('detail.distance', {
          km: Math.abs(province.kmFromHavana),
          direction: province.kmFromHavana < 0 ? 'west' : 'east',
        });

  const conditionRows = detail?.conditions?.items ?? [
    {
      topic: 'power' as const,
      label: t('detail.power'),
      text: null,
      status: hours,
      tone: 'caution' as const,
    },
    {
      topic: 'fuel' as const,
      label: t('detail.fuel'),
      text: null,
      status: t(`fuel.${province.fuel}`),
      tone: province.fuel === 'ok' ? ('ok' as const) : ('caution' as const),
    },
    {
      topic: 'advisories' as const,
      label: t('detail.advisory'),
      text: null,
      status: t('levelShort', { level: province.advisoryLevel }),
      tone: (['ok', 'info', 'caution'] as const)[province.advisoryLevel - 1]!,
    },
  ];

  const sections = [
    detail?.overview ? 'overview' : null,
    'conditions',
    experiences.length > 0 ? 'experiences' : null,
    trips.length > 0 || builder ? 'packages' : null,
    stays.length > 0 ? 'stays' : null,
    detail?.gettingThere ? 'gettingThere' : null,
    detail?.faq ? 'faq' : null,
  ].filter((section): section is string => Boolean(section));

  return (
    <div className="flex flex-col pb-20">
      <section className={cn(wrap, 'grid items-center gap-10 pb-10 pt-6 xl:grid-cols-2')}>
        <div className="flex min-w-0 flex-col gap-5">
          <Breadcrumb
            label={t('breadcrumb')}
            items={[
              { label: nav('home'), href: '/' },
              { label: nav('destinations'), href: '/destinations' },
              { label: destination.name },
            ]}
          />
          {data.status === 'placeholder' ? (
            <Alert variant="info" title={common('placeholderTitle')}>
              {common('placeholderText', { agency: tenant.branding.agencyName })}
            </Alert>
          ) : null}
          <p className="text-overline uppercase text-secondary-600">
            {[province.name, distance, detail?.travelTime].filter(Boolean).join(' · ')}
          </p>
          <h1 className="text-h1 text-default md:text-display-2">{destination.name}</h1>
          <p className="max-w-[60ch] text-body-lg text-secondary">
            {detail?.lede ?? destination.tagline}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={NETWORK_BADGES[province.network]}>
              {t(`status.${province.network}`)} · {destination.stays}
            </Badge>
            <Badge variant={LEVEL_BADGES[province.advisoryLevel]}>
              {t('level', { level: province.advisoryLevel })}
            </Badge>
            <Badge variant="warning">
              <Icon name="zap" className="h-3.5 w-3.5" />
              {t('detail.powerPill', { hours })}
            </Badge>
            {detail?.best ? <Badge variant="secondary">{detail.best}</Badge> : null}
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            {trips.length > 0 ? (
              <a
                href="#packages"
                className={cn(buttonClassName({ size: 'lg' }), wrapButton)}
              >
                {t('detail.seeTrips', { count: trips.length })}
              </a>
            ) : null}
            {builder ? (
              <Link
                href="/custom"
                className={cn(
                  buttonClassName({
                    variant: trips.length > 0 ? 'secondary' : 'primary',
                    size: 'lg',
                  }),
                  wrapButton,
                )}
              >
                {t('detail.addRoute', { name: destination.name })}
              </Link>
            ) : null}
          </div>
        </div>
        <div
          role="img"
          aria-label={detail?.photo?.alt ?? destination.alt}
          className="flex aspect-[4/3] min-w-0 items-center justify-center gap-2 rounded-lg bg-sunken text-body-sm text-muted"
        >
          <Icon name="image" />
          <span aria-hidden="true">{common('photoToCome')}</span>
        </div>
      </section>

      <nav
        aria-label={t('detail.onThisPage')}
        className="sticky top-16 z-20 border-y bg-page lg:top-[72px]"
      >
        <ul className={cn(wrap, 'flex gap-6 overflow-x-auto')}>
          {sections.map((section) => (
            <li key={section} className="shrink-0">
              <a
                href={`#${section}`}
                className="flex h-12 items-center border-b-[3px] border-transparent text-nav text-default hover:border-neutral-300"
              >
                {t(`detail.tabs.${section}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className={cn(wrap, 'flex flex-col gap-16 pt-12')}>
        {detail?.overview ? (
          <section
            id="overview"
            aria-labelledby="overview-title"
            className="grid scroll-mt-40 gap-10 xl:grid-cols-2"
          >
            <div className="flex flex-col gap-4">
              <h2 id="overview-title" className="font-display text-h1-compact md:text-h2">
                {detail.overview.title}
              </h2>
              {detail.overview.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-body text-secondary">
                  {paragraph}
                </p>
              ))}
              {detail.overview.tags.length > 0 ? (
                <ul className="flex flex-wrap gap-2 pt-1">
                  {detail.overview.tags.map((tag) => (
                    <li key={tag}>
                      <Badge variant="secondary" size="lg">
                        {tag}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {detail.overview.facts.length > 0 ? (
              <dl className="grid content-start gap-3 sm:grid-cols-2">
                {detail.overview.facts.map((fact) => (
                  <div
                    key={fact.label}
                    className="flex flex-col gap-0.5 rounded-lg border bg-surface p-4"
                  >
                    <dt className="text-caption text-muted">{fact.label}</dt>
                    <dd className="text-body font-semibold text-default">{fact.value}</dd>
                    {fact.note ? (
                      <dd className="text-caption text-muted">{fact.note}</dd>
                    ) : null}
                  </div>
                ))}
              </dl>
            ) : null}
          </section>
        ) : null}

        <section
          id="conditions"
          aria-labelledby="conditions-title"
          className="flex scroll-mt-40 flex-col gap-6"
        >
          <SectionHead
            id="conditions-title"
            eyebrow={t('detail.conditionsEyebrow', { province: province.name })}
            title={detail?.conditions?.title ?? t('detail.conditionsTitle')}
            action={
              detail?.conditions?.updated ? (
                <p className="text-caption text-muted">{detail.conditions.updated}</p>
              ) : null
            }
          />
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <ul className="flex flex-col rounded-lg border bg-surface px-5">
              {conditionRows.map((row) => (
                <li
                  key={row.topic}
                  className="flex items-start gap-3 border-b py-4 last:border-b-0"
                >
                  <Icon name={TOPIC_ICONS[row.topic]} className="mt-0.5 text-secondary" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="text-body font-semibold text-default">{row.label}</p>
                    {row.text ? (
                      <p className="text-body-sm text-secondary">{row.text}</p>
                    ) : null}
                  </div>
                  <Badge variant={TONE_BADGES[row.tone]}>{row.status}</Badge>
                </li>
              ))}
            </ul>
            {detail?.conditions?.plan ? (
              <div className="flex flex-col gap-3 rounded-lg bg-secondary-100 p-6">
                <p className="text-overline uppercase text-secondary-700">
                  {detail.conditions.plan.title}
                </p>
                <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-secondary">
                  {detail.conditions.plan.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>

        {experiences.length > 0 ? (
          <section
            id="experiences"
            aria-labelledby="experiences-title"
            className="flex scroll-mt-40 flex-col gap-6"
          >
            <SectionHead
              id="experiences-title"
              eyebrow={detail?.experiences?.eyebrow}
              title={
                detail?.experiences?.title ??
                t('detail.experiencesTitle', { province: province.name })
              }
            />
            <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {experiences.map((item) => (
                <li key={item.id} className="flex min-w-0">
                  <CatalogItemCard item={item} builder={builder} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {trips.length > 0 || builder ? (
          <section
            id="packages"
            aria-labelledby="packages-title"
            className="flex scroll-mt-40 flex-col gap-6"
          >
            <SectionHead
              id="packages-title"
              eyebrow={detail?.packages?.eyebrow}
              title={
                detail?.packages?.title ??
                t('detail.packagesTitle', { name: destination.name })
              }
              action={<ArrowLink href="/packages">{t('detail.allTrips')}</ArrowLink>}
            />
            <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {trips.map((pkg) => (
                <li key={pkg.id} className="flex min-w-0">
                  <PackageCard pkg={pkg} instant={instant} />
                </li>
              ))}
              {builder ? (
                <li className="flex min-w-0">
                  <Link
                    href="/custom"
                    className="flex w-full flex-col overflow-hidden rounded-lg border border-dashed bg-surface transition hover:shadow-md"
                  >
                    <span className="flex aspect-video items-center justify-center bg-sunken text-secondary-600">
                      <Icon name="plus" className="h-8 w-8" />
                    </span>
                    <span className="flex flex-col gap-2 px-5 pb-5 pt-4">
                      <span className="text-overline uppercase text-muted">
                        {t('detail.customEyebrow')}
                      </span>
                      <span className="font-display text-h2-compact text-default">
                        {t('detail.customTitle', { name: destination.name })}
                      </span>
                      <span className="text-body-sm text-secondary">
                        {t('detail.customText')}
                      </span>
                      <span className="font-semibold text-primary-600">
                        {t('detail.customCta')}
                      </span>
                    </span>
                  </Link>
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}

        {stays.length > 0 ? (
          <section
            id="stays"
            aria-labelledby="stays-title"
            className="flex scroll-mt-40 flex-col gap-6"
          >
            <div className="flex flex-col gap-2">
              <SectionHead
                id="stays-title"
                eyebrow={detail?.stays?.eyebrow}
                title={
                  detail?.stays?.title ??
                  t('detail.staysTitle', { province: province.name })
                }
              />
              {detail?.stays?.note ? (
                <p className="text-caption text-muted">{detail.stays.note}</p>
              ) : null}
            </div>
            <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {stays.map((item) => (
                <li key={item.id} className="flex min-w-0">
                  <CatalogItemCard item={item} builder={builder} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {detail?.gettingThere ? (
          <section
            id="gettingThere"
            aria-labelledby="getting-there-title"
            className="flex max-w-3xl scroll-mt-40 flex-col gap-5"
          >
            <SectionHead
              id="getting-there-title"
              eyebrow={detail.gettingThere.eyebrow}
              title={detail.gettingThere.title}
            />
            <div className="overflow-x-auto rounded-lg border bg-surface">
              <Table>
                <TableHeader>
                  <TableRow>
                    {detail.gettingThere.head.map((cell, index, head) => (
                      <TableHead
                        key={cell}
                        className={cn(index === head.length - 1 && 'text-right')}
                      >
                        {cell}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.gettingThere.rows.map((row) => (
                    <TableRow key={row.join('|')}>
                      {row.map((cell, index) => (
                        <TableCell
                          key={index}
                          className={cn(
                            index === row.length - 1 &&
                              'whitespace-nowrap text-right font-mono',
                          )}
                        >
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {detail.gettingThere.note ? (
              <p className="text-body-sm text-secondary">{detail.gettingThere.note}</p>
            ) : null}
          </section>
        ) : null}

        {detail?.faq ? (
          <section
            id="faq"
            aria-labelledby="faq-title"
            className="flex max-w-3xl scroll-mt-40 flex-col gap-4"
          >
            <SectionHead
              id="faq-title"
              eyebrow={t('detail.tabs.faq')}
              title={detail.faq.title}
            />
            <div>
              {detail.faq.items.map((item) => (
                <AccordionItem key={item.id} title={item.question} level={3}>
                  <div className="flex flex-col gap-2 pb-4">
                    <p className="text-body text-default">{item.answer}</p>
                    {item.details ? (
                      <p className="text-body-sm text-secondary">{item.details}</p>
                    ) : null}
                  </div>
                </AccordionItem>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

'use client';

import {
  nearestByRoad,
  roadHours,
  summarizeNetwork,
  summarizeRoute,
  toggleRouteStop,
} from '@ota/domain';
import { Badge, Button, buttonClassName, cn, Icon } from '@ota/ui';
import type { BadgeVariant } from '@ota/ui';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { Link } from '@/i18n/navigation';
import { formatMoney } from '@/lib/format';
import type { DestinationView, ProvinceView } from '@/lib/geography';

import { DestinationCard } from './destination-card';
import { ProvinceMap, type MapLayer } from './province-map';

const LAYERS: readonly MapLayer[] = ['coverage', 'conditions', 'route'];
const REGIONS = ['west', 'centre', 'east'] as const;

const STATUS_BADGES: Record<ProvinceView['network'], BadgeVariant> = {
  active: 'success',
  limited: 'warning',
  none: 'secondary',
};

const LEVEL_BADGES: Record<ProvinceView['advisoryLevel'], BadgeVariant> = {
  1: 'success',
  2: 'info',
  3: 'warning',
};

/** The map tones as literal swatch classes (Tailwind only emits classes it can read). */
const SWATCHES = {
  active: 'border-success-600 bg-success-200',
  limited: 'border-dashed border-warning-600 bg-warning-100',
  none: 'border-neutral-300 [background-image:repeating-linear-gradient(45deg,var(--color-neutral-100)_0_3px,var(--color-neutral-300)_3px_4px)]',
  level1: 'border-success-600 bg-success-100',
  level2: 'border-info-600 bg-info-100',
  level3: 'border-warning-600 bg-warning-100',
  stop: 'border-primary-600 bg-primary-50',
  closed: 'border-neutral-300 bg-neutral-100',
  open: 'border-neutral-300 bg-neutral-0',
} as const;

/** The strip button's swatch: the province's colour on the current layer, as on the map. */
function swatch(province: ProvinceView, layer: MapLayer, inRoute: boolean): string {
  if (layer === 'conditions') {
    return SWATCHES[`level${province.advisoryLevel}`];
  }
  if (layer === 'route') {
    return inRoute
      ? SWATCHES.stop
      : province.network === 'none'
        ? SWATCHES.closed
        : SWATCHES.open;
  }
  return SWATCHES[province.network];
}

/**
 * Destinations (Destinations board): a province map with three layers — where
 * the network operates, conditions now, and a route sketch — a panel for the
 * picked province or the route, the same provinces as a strip of buttons, and
 * the destinations filtered by province or route and by theme.
 */
export function DestinationsExplorer({
  provinces,
  destinations,
  themes,
  updated,
  conditionsNote,
  initialProvince,
}: {
  provinces: readonly ProvinceView[];
  destinations: readonly DestinationView[];
  themes: readonly { key: string; label: string }[];
  /** When the figures were last checked (YYYY-MM-DD). */
  updated: string;
  /** The tenant's "Cuba right now" line for the conditions layer. */
  conditionsNote: string | null;
  initialProvince: string | null;
}) {
  const t = useTranslations('destinations');
  const format = useFormatter();
  const locale = useLocale();
  const [layer, setLayer] = useState<MapLayer>('coverage');
  const [selected, setSelected] = useState<string | null>(initialProvince);
  const [theme, setTheme] = useState('all');
  const [route, setRoute] = useState<string[]>([]);

  const byCode = new Map(provinces.map((province) => [province.code, province]));
  const updatedLabel = format.dateTime(new Date(`${updated}T12:00:00Z`), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const picked = selected ? (byCode.get(selected) ?? null) : null;

  const cuts = (province: ProvinceView) =>
    province.powerCuts.max === null
      ? t('hours.open', { min: province.powerCuts.min })
      : province.powerCuts.max === province.powerCuts.min
        ? t('hours.single', { min: province.powerCuts.min })
        : t('hours.range', { min: province.powerCuts.min, max: province.powerCuts.max });
  const stays = (province: ProvinceView) =>
    province.casas === 0 && province.hotels === 0
      ? '—'
      : [
          province.casas > 0 ? t('casas', { count: province.casas }) : null,
          province.hotels > 0 ? t('hotels', { count: province.hotels }) : null,
        ]
          .filter(Boolean)
          .join(' · ');
  const describe = (province: ProvinceView) =>
    [
      province.name,
      t(`status.${province.network}`),
      stays(province),
      t('experiencesCount', { count: province.experiences }),
      ...(layer === 'conditions'
        ? [
            t('level', { level: province.advisoryLevel }),
            t('cuts', { hours: cuts(province) }),
          ]
        : []),
    ].join(' · ');
  const distance = (km: number) =>
    km === 0
      ? t('panel.capital')
      : t('panel.distance', {
          km: Math.abs(km),
          direction: km < 0 ? 'west' : 'east',
          hours: format.number(roadHours(Math.abs(km)), { maximumFractionDigits: 1 }),
        });

  function pick(code: string) {
    const province = byCode.get(code);
    if (!province) {
      return;
    }
    if (layer === 'route') {
      if (province.network === 'none') {
        setSelected(code);
        return;
      }
      setRoute((current) => toggleRouteStop(current, code));
      setSelected(null);
      return;
    }
    setSelected((current) => (current === code ? null : code));
  }

  function chooseLayer(next: MapLayer) {
    setLayer(next);
    setSelected(null);
  }

  const inScope = (destination: DestinationView) =>
    layer === 'route' && route.length > 0
      ? route.includes(destination.province)
      : !selected || layer === 'route' || destination.province === selected;
  const shown = destinations.filter(
    (destination) =>
      inScope(destination) && (theme === 'all' || destination.theme === theme),
  );
  const stripProvinces = provinces.filter((province) => province.region !== 'isle');

  /** One province as a button; `stacked` puts the figure under the name (the phone strip). */
  const provinceButton = (province: ProvinceView, stacked = false) => {
    const inRoute = route.includes(province.code);
    const on = selected === province.code || (layer === 'route' && inRoute);
    const sub =
      layer === 'conditions'
        ? t('cuts', { hours: cuts(province) })
        : layer === 'route'
          ? inRoute
            ? t('route.stop', { n: route.indexOf(province.code) + 1 })
            : province.network === 'none'
              ? t('route.notSold')
              : t('route.nights', { count: province.nights })
          : stays(province);
    return (
      <button
        key={province.code}
        type="button"
        aria-pressed={on}
        aria-label={describe(province)}
        onClick={() => pick(province.code)}
        className={cn(
          'flex min-w-0 rounded-md border bg-surface px-3 text-left transition-colors hover:border-primary-600',
          stacked
            ? 'w-40 shrink-0 flex-col items-start gap-0.5 py-2'
            : 'h-12 items-center justify-between gap-2',
          on && 'border-primary-600 bg-primary-50',
        )}
      >
        <span className="flex min-w-0 max-w-full items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cn(
              'h-3.5 w-3.5 shrink-0 rounded-sm border',
              swatch(province, layer, inRoute),
            )}
          />
          <span className="truncate text-body font-medium text-default">
            {province.name}
          </span>
        </span>
        <span className="shrink-0 font-mono text-caption text-muted">{sub}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label={t('layersLabel')}
          className="-mx-1 flex max-w-full gap-1 overflow-x-auto rounded-full border bg-surface p-1"
        >
          {LAYERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={layer === option}
              onClick={() => chooseLayer(option)}
              className={cn(
                'h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-body-sm font-semibold transition-colors',
                layer === option
                  ? 'bg-action-primary text-on-primary'
                  : 'text-default hover:bg-neutral-100',
              )}
            >
              {t(`layers.${option}`)}
            </button>
          ))}
        </div>
        <p className="text-caption text-muted">
          {t(`hints.${layer}`, { date: updatedLabel })}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section
            aria-labelledby="map-title"
            className="flex flex-col gap-3 rounded-lg border bg-surface p-4 md:p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="map-title" className="text-h4 text-default">
                {t('mapTitle')}
              </h2>
              <p className="text-caption text-muted">{t(`legend.${layer}`)}</p>
            </div>
            <ProvinceMap
              provinces={provinces}
              points={destinations.map((destination) => destination.point)}
              layer={layer}
              selected={selected}
              route={route}
              label={t('mapAria')}
              describe={describe}
              onPick={pick}
            />
            <p className="text-caption text-muted">{t('mapNote')}</p>
          </section>

          <div className="flex gap-2 overflow-x-auto pb-1 md:hidden">
            {stripProvinces.map((province) => provinceButton(province, true))}
          </div>
          <div className="hidden gap-4 md:grid md:grid-cols-3">
            {REGIONS.map((region) => {
              const members = stripProvinces.filter(
                (province) => province.region === region,
              );
              const active = members.filter(
                (province) => province.network === 'active',
              ).length;
              return (
                <div key={region} className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-overline uppercase text-secondary-600">
                      {t(`regions.${region}`)}
                    </p>
                    <p className="text-caption text-muted">
                      {layer === 'conditions'
                        ? t(`regionMeta.${region}`)
                        : t('regionActive', { active, total: members.length })}
                    </p>
                  </div>
                  {members.map((province) => provinceButton(province))}
                </div>
              );
            })}
          </div>
        </div>

        <aside
          aria-label={t('panel.label')}
          className={cn(
            'flex flex-col gap-4 rounded-lg border bg-surface p-5 shadow-md lg:sticky lg:top-24',
            picked?.network === 'none' && 'border-dashed',
            !picked && layer !== 'route' && 'hidden lg:flex',
          )}
        >
          {picked
            ? provincePanel(picked)
            : layer === 'route'
              ? routePanel(
                  route
                    .map((code) => byCode.get(code))
                    .filter((province): province is ProvinceView => Boolean(province)),
                )
              : networkPanel()}
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-body-sm text-secondary">
          {layer === 'route' && route.length > 0
            ? t('showingRoute')
            : picked && layer !== 'route'
              ? t('showingProvince', { province: picked.name, count: shown.length })
              : t('showingAll')}
        </p>
        {picked && layer !== 'route' ? (
          <Button variant="tertiary" size="sm" onClick={() => setSelected(null)}>
            {t('clearProvince')}
          </Button>
        ) : null}
      </div>

      <section aria-labelledby="destinations-list" className="flex flex-col gap-5">
        <h2 id="destinations-list" className="sr-only">
          {t('count', { count: shown.length })}
        </h2>
        <div className="flex items-center gap-3">
          <div
            role="group"
            aria-label={t('filterLabel')}
            className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1"
          >
            {[{ key: 'all', label: t('all') }, ...themes].map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={theme === option.key}
                onClick={() => setTheme(option.key)}
                className={cn(
                  'h-10 shrink-0 whitespace-nowrap rounded-full border px-4 text-body transition-colors',
                  theme === option.key
                    ? 'border-primary-600 bg-action-primary text-on-primary'
                    : 'border-input bg-surface text-default hover:bg-neutral-100',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="hidden shrink-0 text-caption text-muted sm:block">
            {t('count', { count: shown.length })}
          </p>
        </div>
        {shown.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
            <p className="text-body text-secondary">{t('empty')}</p>
            <Link href="/custom" className={buttonClassName({ variant: 'secondary' })}>
              {t('panel.askCustom')}
            </Link>
          </div>
        ) : (
          <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((destination) => (
              <li key={destination.slug} className="flex min-w-0">
                <DestinationCard destination={destination} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  // The panels are render functions, not components: a component declared in
  // here would remount on every render and drop the focus of its buttons.
  function networkPanel() {
    const network = summarizeNetwork(stripProvinces);
    return (
      <>
        <div className="flex flex-col gap-1.5">
          <p className="text-overline uppercase text-primary-600">{t('panel.eyebrow')}</p>
          <h3 className="font-display text-h3 text-default">{t('panel.title')}</h3>
        </div>
        <p className="text-body-sm text-secondary">{t('panel.text')}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body-sm">
          <dt className="text-secondary">{t('panel.activeProvinces')}</dt>
          <dd className="font-semibold text-default">
            {t('panel.activeValue', { active: network.active, total: network.provinces })}
          </dd>
          <dt className="text-secondary">{t('panel.casasVetted')}</dt>
          <dd className="font-semibold text-default">
            {[
              t('casas', { count: network.casas }),
              network.hotels > 0 ? t('hotels', { count: network.hotels }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </dd>
          <dt className="text-secondary">{t('panel.guidesDrivers')}</dt>
          <dd className="font-semibold text-default">
            {network.guides} · {network.drivers}
          </dd>
          <dt className="text-secondary">{t('panel.updated')}</dt>
          <dd className="font-semibold text-default">{updatedLabel}</dd>
        </dl>
        {layer === 'conditions' && conditionsNote ? (
          <div className="flex gap-2.5 rounded-md bg-info-100 p-3 text-body-sm text-info-700">
            <Icon name="info" className="mt-px shrink-0" />
            <p>
              {conditionsNote}{' '}
              <Link
                href="/travel-info"
                className="font-semibold underline underline-offset-[3px]"
              >
                {t('panel.fullConditions')}
              </Link>
            </p>
          </div>
        ) : (
          <p className="text-caption text-muted">{t('statusNote')}</p>
        )}
      </>
    );
  }

  function provincePanel(province: ProvinceView) {
    const here = destinations.filter(
      (destination) => destination.province === province.code,
    );
    const inRoute = route.includes(province.code);
    const sold = province.network !== 'none';
    const nearest = sold
      ? null
      : nearestByRoad(
          province,
          provinces.filter((candidate) => candidate.network === 'active'),
        );
    const trips = here.reduce((sum, destination) => sum + destination.packageCount, 0);
    const region = province.region === 'isle' ? 'west' : province.region;

    return (
      <>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p
              className={cn(
                'text-overline uppercase',
                sold ? 'text-secondary-600' : 'text-muted',
              )}
            >
              {t(`regions.${region}`)} · {distance(province.kmFromHavana)}
            </p>
            <h3 className="font-display text-h3 text-default">{province.name}</h3>
          </div>
          <Button
            variant="tertiary"
            size="icon"
            aria-label={t('panel.close')}
            onClick={() => setSelected(null)}
          >
            <Icon name="x" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={STATUS_BADGES[province.network]}>
            {t(`status.${province.network}`)}
          </Badge>
          <Badge variant={LEVEL_BADGES[province.advisoryLevel]}>
            {t('level', { level: province.advisoryLevel })}
          </Badge>
        </div>
        <p className="text-body-sm text-secondary">
          {[
            province.summary ? `${province.summary}.` : null,
            province.network === 'limited' ? t('panel.limitedNote') : null,
            province.network === 'none' ? t('panel.noneNote') : null,
          ]
            .filter(Boolean)
            .join(' ')}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body-sm">
          {sold ? (
            <>
              <dt className="text-secondary">{t('panel.casas')}</dt>
              <dd className="font-semibold text-default">{stays(province)}</dd>
              <dt className="text-secondary">{t('panel.guidesDrivers')}</dt>
              <dd className="font-semibold text-default">
                {province.guides} · {province.drivers}
              </dd>
              <dt className="text-secondary">{t('panel.experiences')}</dt>
              <dd className="font-semibold text-default">
                {t('experiencesCount', { count: province.experiences })}
              </dd>
            </>
          ) : (
            <>
              <dt className="text-secondary">{t('panel.nearest')}</dt>
              <dd className="font-semibold text-default">
                {nearest
                  ? `${nearest.name} · ${t('panel.kmAway', {
                      km: Math.abs(nearest.kmFromHavana - province.kmFromHavana),
                    })}`
                  : '—'}
              </dd>
            </>
          )}
          <dt className="text-secondary">{t('panel.fromHavana')}</dt>
          <dd className="font-semibold text-default">
            {distance(province.kmFromHavana)}
          </dd>
        </dl>
        <div className="flex gap-2.5 rounded-md bg-sunken p-3 text-body-sm text-secondary">
          <Icon name="zap" className="mt-px shrink-0" />
          <p>
            {t.rich('panel.conditionsLine', {
              hours: cuts(province),
              fuel: t(`fuel.${province.fuel}`),
              date: updatedLabel,
              backup: sold ? 'yes' : 'no',
              strong: (chunks) => (
                <strong className="font-semibold text-default">{chunks}</strong>
              ),
            })}
          </p>
        </div>
        {here.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-caption text-muted">{t('panel.here')}</p>
            <ul className="flex flex-col gap-1.5">
              {here.map((destination) => (
                <li key={destination.slug}>
                  <Link
                    href={`/destinations/${destination.slug}`}
                    className="flex items-center gap-3 rounded-md p-1 hover:bg-neutral-100"
                  >
                    <span
                      aria-hidden="true"
                      className="h-10 w-14 shrink-0 rounded-md bg-sunken"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-body-sm font-semibold text-default">
                        {destination.name}
                      </span>
                      <span className="text-caption text-muted">
                        {t('packagesCount', { count: destination.packageCount })} ·{' '}
                        {destination.fromPrice
                          ? t('fromPrice', {
                              price: formatMoney(
                                destination.fromPrice.amount,
                                destination.fromPrice.currency,
                                locale,
                              ),
                            })
                          : t('onRequest')}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {sold ? (
          <Link
            href={`/packages?province=${encodeURIComponent(province.name)}`}
            className="text-body-sm font-semibold text-primary-600 underline underline-offset-[3px]"
          >
            {t('panel.packagesLine', { count: trips })}
          </Link>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {sold ? (
            <>
              <Button
                onClick={() => {
                  setRoute((current) => toggleRouteStop(current, province.code));
                  setLayer('route');
                  setSelected(null);
                }}
              >
                {inRoute ? t('panel.removeRoute') : t('panel.addRoute')}
              </Button>
              {here[0] ? (
                <Link
                  href={`/destinations/${here[0].slug}`}
                  className={buttonClassName({ variant: 'secondary' })}
                >
                  {t('panel.readMore')}
                </Link>
              ) : null}
            </>
          ) : (
            <Link href="/custom" className={buttonClassName({ variant: 'secondary' })}>
              {t('panel.askCustom')}
            </Link>
          )}
        </div>
      </>
    );
  }

  function routePanel(stops: readonly ProvinceView[]) {
    const summary = summarizeRoute(
      stops.map((stop) => ({
        id: stop.code,
        kmFromHavana: stop.kmFromHavana,
        nights: stop.nights,
        limited: stop.network === 'limited',
      })),
    );
    const hours = (value: number) => format.number(value, { maximumFractionDigits: 1 });

    return (
      <>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-overline uppercase text-secondary-600">
              {t('route.eyebrow', { stops: stops.length, nights: summary.nights })}
            </p>
            <h3 className="font-display text-h3 text-default">
              {stops.length > 0
                ? stops.map((stop) => stop.name).join(' → ')
                : t('route.title')}
            </h3>
          </div>
          {stops.length > 0 ? (
            <Button variant="tertiary" size="sm" onClick={() => setRoute([])}>
              {t('route.clear')}
            </Button>
          ) : null}
        </div>
        {stops.length === 0 ? (
          <p className="text-body-sm text-secondary">{t('route.empty')}</p>
        ) : (
          <>
            <ol className="flex flex-col">
              {stops.map((stop, index) => {
                const leg = index > 0 ? summary.legs[index - 1] : undefined;
                return (
                  <li key={stop.code} className="flex flex-col">
                    {leg ? (
                      <p className="py-1 pl-10 font-mono text-caption text-muted">
                        ↓{' '}
                        {t('route.leg', {
                          km: format.number(leg.km),
                          hours: hours(leg.hours),
                        })}
                        {leg.flight ? ` · ${t('route.flightLeg')}` : ''}
                      </p>
                    ) : null}
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary-600 text-caption font-bold text-neutral-0"
                      >
                        {index + 1}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-body-sm font-semibold text-default">
                          {stop.name}
                        </span>
                        {stop.summary ? (
                          <span className="text-caption text-muted">{stop.summary}</span>
                        ) : null}
                      </span>
                      <span className="text-caption text-muted">
                        {t('route.nights', { count: stop.nights })}
                      </span>
                      <Button
                        variant="tertiary"
                        size="icon"
                        aria-label={t('route.remove', { name: stop.name })}
                        onClick={() =>
                          setRoute((current) =>
                            current.filter((code) => code !== stop.code),
                          )
                        }
                      >
                        <Icon name="x" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body-sm">
              <dt className="text-secondary">{t('route.road')}</dt>
              <dd className="font-semibold text-default">
                {t('route.roadValue', {
                  km: format.number(summary.km),
                  hours: hours(summary.hours),
                })}
              </dd>
              <dt className="text-secondary">{t('route.nightsLabel')}</dt>
              <dd className="font-semibold text-default">
                {t('route.nightsValue', { nights: summary.nights })}
              </dd>
            </dl>
            {summary.needsFlight ? (
              <p className="flex gap-2.5 rounded-md bg-info-100 p-3 text-body-sm text-info-700">
                <Icon name="info" className="mt-px shrink-0" />
                {t('route.flight')}
              </p>
            ) : null}
            {summary.hasLimited ? (
              <p className="flex gap-2.5 rounded-md bg-warning-100 p-3 text-body-sm text-warning-700">
                <Icon name="alert-triangle" className="mt-px shrink-0" />
                {t('route.limited')}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/custom" className={buttonClassName()}>
                {t('route.builder')}
              </Link>
              <Link
                href={`/packages?${stops
                  .map((stop) => `province=${encodeURIComponent(stop.name)}`)
                  .join('&')}`}
                className={buttonClassName({ variant: 'secondary' })}
              >
                {t('route.packages')}
              </Link>
            </div>
          </>
        )}
      </>
    );
  }
}

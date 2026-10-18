'use client';

import type { CustomBuilderConfig } from '@ota/config';
import {
  BUILDER_INTERESTS,
  BUILDER_PACES,
  FLIGHT_LEG_KM,
  GUIDING_CHOICES,
  MAX_ROUTE_STOPS,
  customTripEstimate,
  summarizeRoute,
  toggleRouteStop,
  type GuidingChoice,
} from '@ota/domain';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Counter,
  Icon,
  Input,
  Label,
  Radio,
  RadioGroup,
  Select,
  Stepper,
  Textarea,
  buttonClassName,
  cn,
} from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';

import { Link } from '@/i18n/navigation';
import type { CountryOption } from '@/lib/countries';
import { formatMoney, plainSpaces } from '@/lib/format';

const STEP_IDS = ['route', 'transport', 'stays', 'activities', 'summary'] as const;
const DAY_MS = 86_400_000;

/** A province the traveler can sleep in, with the words the server looked up. */
export interface BuilderProvince {
  code: string;
  name: string;
  summary: string | null;
  limited: boolean;
  kmFromHavana: number;
  /** The tenant's suggested nights for a stop there. */
  nights: number;
}

/** A catalog experience offered in one of the provinces. */
export interface BuilderActivity {
  id: string;
  name: string;
  province: string;
  price: number;
  currency: string;
}

interface Stop {
  province: string;
  nights: number;
  stay: string | null;
}

interface SentRequest {
  id: string;
  reference: string;
}

/**
 * The designed custom-trip builder (Custom / M-Custom boards, M5): dates,
 * party and an ordered route of provinces with nights, pace and interests;
 * transport style; a stay style per stop; activities per stop and guiding;
 * then the summary and the traveler's details. A side panel keeps the route
 * and an estimate from the tenant's rates (a range, never a price).
 * Submitting creates a CustomRequest — not a booking — for the desk to price.
 */
export function CustomBuilder({
  provinces,
  activities,
  builder,
  countries,
  locales,
  todayIso,
}: {
  provinces: BuilderProvince[];
  activities: BuilderActivity[];
  /** The tenant's styles and sample rates; null offers no styles or estimate. */
  builder: CustomBuilderConfig | null;
  countries: CountryOption[];
  /** The tenant's traveler locales, named in the visitor's language. */
  locales: { code: string; name: string }[];
  /** Today as YYYY-MM-DD from the server, the earliest arrival. */
  todayIso: string;
}) {
  const t = useTranslations('build');
  const locale = useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(1);
  const [arrival, setArrival] = useState('');
  const [nightsTotal, setNightsTotal] = useState(10);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [route, setRoute] = useState<Stop[]>([]);
  const [pace, setPace] = useState<(typeof BUILDER_PACES)[number]>('moderate');
  const [interests, setInterests] = useState<string[]>([]);
  const [transport, setTransport] = useState<string | null>(
    builder?.transports[0]?.key ?? null,
  );
  const [stepFree, setStepFree] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [guiding, setGuiding] = useState<GuidingChoice>('none');
  const [interpreter, setInterpreter] = useState(false);
  const [nationality, setNationality] = useState('');
  const [language, setLanguage] = useState(locale);
  const [budget, setBudget] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentRequest | null>(null);

  const currency = builder?.currency ?? 'EUR';
  const money = (amount: number) => plainSpaces(formatMoney(amount, currency, locale));
  const byCode = useMemo(
    () => new Map(provinces.map((province) => [province.code, province])),
    [provinces],
  );
  const stayRate = (key: string | null) =>
    builder?.stayStyles.find((style) => style.key === key)?.pricePerNight ?? 0;

  const placed = route.reduce((sum, stop) => sum + stop.nights, 0);
  const diff = nightsTotal - placed;
  const summary = summarizeRoute(
    route.map((stop) => {
      const province = byCode.get(stop.province)!;
      return {
        id: stop.province,
        kmFromHavana: province.kmFromHavana,
        nights: stop.nights,
        limited: province.limited,
      };
    }),
  );
  const endIso = arrival
    ? new Date(Date.parse(arrival) + nightsTotal * DAY_MS).toISOString().slice(0, 10)
    : '';
  const day = (iso: string) =>
    plainSpaces(
      new Intl.DateTimeFormat(locale, {
        timeZone: 'UTC',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(iso)),
    );

  const onRoute = new Set(route.map((stop) => stop.province));
  const picked = activities.filter(
    (activity) => chosen.includes(activity.id) && onRoute.has(activity.province),
  );
  const estimate = builder
    ? customTripEstimate({
        stops: route.map((stop) => ({
          nights: stop.nights,
          stayPerNight: stayRate(stop.stay),
        })),
        activities: picked.map((activity) => activity.price),
        guiding,
        interpreter,
        partySize: adults + children,
        rates: {
          transportPerPersonDay:
            builder.transports.find((option) => option.key === transport)
              ?.pricePerPersonDay ?? 0,
          sharedGuidePerPersonDay: builder.guiding.sharedPerPersonDay,
          privateGuidePerGroupDay: builder.guiding.privatePerGroupDay,
          interpreterPerGroupDay: builder.interpreterPerGroupDay,
          offsetPerNight: builder.offsetPerNight,
          feePercent: builder.feePercent,
          spreadPercent: builder.spreadPercent,
        },
      })
    : null;

  const routeReady = Boolean(arrival) && route.length > 0 && diff === 0;
  const party = t('summary.party', { adults, children });
  const nightsLabel = t('route.stopNights', { count: nightsTotal });

  function go(next: number) {
    setStep(next);
    setError(null);
    requestAnimationFrame(() => heading.current?.focus());
  }

  function toggleProvince(code: string) {
    const order = toggleRouteStop(
      route.map((stop) => stop.province),
      code,
    );
    setRoute(
      order.map(
        (id) =>
          route.find((stop) => stop.province === id) ?? {
            province: id,
            nights: Math.max(1, byCode.get(id)?.nights ?? 2),
            stay: builder?.defaultStayStyle ?? null,
          },
      ),
    );
  }

  function patchStop(code: string, patch: Partial<Stop>) {
    setRoute((stops) =>
      stops.map((stop) => (stop.province === code ? { ...stop, ...patch } : stop)),
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/ota/me/custom-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startDate: arrival,
          endDate: endIso,
          adults,
          children,
          inventoryItemIds: picked.map((activity) => activity.id),
          ...(nationality ? { nationality } : {}),
          ...(budget.trim() && Number(budget) >= 0
            ? { budgetPerPerson: Number(budget) }
            : {}),
          interests,
          pace,
          route: route.map((stop) => ({
            province: stop.province,
            nights: stop.nights,
            ...(stop.stay ? { stay: stop.stay } : {}),
          })),
          ...(transport ? { transport } : {}),
          guiding,
          interpreter,
          stepFree,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          locale: language,
        }),
      });
      if (!response.ok) {
        throw new Error(t('summary.error'));
      }
      setSent((await response.json()) as SentRequest);
      window.scrollTo({ top: 0 });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('summary.error'));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <section
        aria-labelledby="requested-title"
        className="flex flex-col items-start gap-4 rounded-lg border bg-surface p-6 md:p-8"
      >
        <Badge variant="success">{t('requestedTitle')}</Badge>
        <h2 id="requested-title" className="text-h3 text-default">
          {t('requestedTitle')}
        </h2>
        <p className="text-body text-secondary">{t('requestedLede')}</p>
        <p className="text-body-sm">
          {t('reference')}:{' '}
          <span className="font-mono font-semibold">{sent.reference}</span>
        </p>
        <p className="text-body-sm text-muted">{t('requestedNote')}</p>
        <Link
          href={`/account/proposals/${sent.id}`}
          className={buttonClassName({ size: 'lg' })}
        >
          {t('openProposal')}
        </Link>
      </section>
    );
  }

  const stepHead = (title: string, lede: string) => (
    <div className="flex flex-col gap-1.5">
      <p className="text-overline uppercase text-primary-600">
        {t('stepOf', { step, total: STEP_IDS.length })}
      </p>
      <h2
        ref={heading}
        tabIndex={-1}
        className="text-h2-compact text-default outline-none"
      >
        {title}
      </h2>
      <p className="text-body text-secondary">{lede}</p>
    </div>
  );

  const card = 'flex min-w-0 flex-col gap-4 rounded-lg border bg-surface p-5';
  const chip = (on: boolean) =>
    cn(
      'inline-flex min-h-touch items-center gap-2 rounded-full border px-4 text-body-sm',
      on
        ? 'border-primary-600 bg-primary-100 font-semibold text-primary-700'
        : 'border-input bg-surface text-default hover:bg-neutral-100',
    );

  const routeStep = (
    <div className="flex flex-col gap-6">
      {stepHead(t('route.title'), t('route.lede'))}
      <div className={cn(card, 'grid gap-4 sm:grid-cols-2')}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="build-arrival">{t('route.arrival')}</Label>
          <Input
            id="build-arrival"
            type="date"
            min={todayIso}
            value={arrival}
            onChange={(event) => setArrival(event.target.value)}
          />
          <p className="text-caption text-muted">{t('route.arrivalHint')}</p>
        </div>
        <div className="flex flex-col">
          <Counter
            label={t('route.nights')}
            description={endIso ? t('route.returns', { date: day(endIso) }) : undefined}
            value={nightsTotal}
            min={1}
            max={MAX_ROUTE_STOPS * 30}
            onValueChange={setNightsTotal}
            decrementLabel={t('route.nightFewer')}
            incrementLabel={t('route.nightMore')}
          />
        </div>
        <Counter
          label={t('route.adults')}
          value={adults}
          min={1}
          max={20}
          onValueChange={setAdults}
          decrementLabel={t('route.adultFewer')}
          incrementLabel={t('route.adultMore')}
        />
        <Counter
          label={t('route.children')}
          description={t('route.childrenHint')}
          value={children}
          min={0}
          max={20}
          onValueChange={setChildren}
          decrementLabel={t('route.childFewer')}
          incrementLabel={t('route.childMore')}
        />
      </div>

      <fieldset className={card}>
        <legend className="sr-only">{t('route.provinces')}</legend>
        <p aria-hidden="true" className="text-body-sm font-semibold text-default">
          {t('route.provinces')}
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {provinces.map((province) => {
            const on = onRoute.has(province.code);
            return (
              <li key={province.code} className="min-w-0">
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={!on && route.length >= MAX_ROUTE_STOPS}
                  onClick={() => toggleProvince(province.code)}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 rounded-md border p-3 text-left disabled:opacity-50',
                    on
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-input bg-surface hover:bg-neutral-100',
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="text-body-sm font-semibold text-default">
                      {province.name}
                    </span>
                    {province.limited ? (
                      <Badge variant="secondary">{t('route.limited')}</Badge>
                    ) : null}
                  </span>
                  {province.summary ? (
                    <span className="text-caption text-muted">{province.summary}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-caption text-muted">{t('route.limitedNote')}</p>
        {route.length >= MAX_ROUTE_STOPS ? (
          <p className="text-caption text-muted">
            {t('route.full', { max: MAX_ROUTE_STOPS })}
          </p>
        ) : null}
      </fieldset>

      <section aria-labelledby="route-title" className={card}>
        <h3 id="route-title" className="text-body font-semibold text-default">
          {t('route.routeTitle', { placed, total: nightsTotal })}
        </h3>
        {route.length === 0 ? (
          <p className="text-body-sm text-muted">{t('route.routeEmpty')}</p>
        ) : (
          <ol className="flex flex-col divide-y">
            {route.map((stop, index) => {
              const province = byCode.get(stop.province)!;
              const leg = summary.legs[index - 1];
              return (
                <li
                  key={stop.province}
                  className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-600 text-label text-on-primary"
                  >
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 basis-40 flex-col">
                    <span className="text-body-sm font-semibold text-default">
                      {province.name}
                    </span>
                    <span className="text-caption text-muted">
                      {index === 0
                        ? province.kmFromHavana !== 0
                          ? t('route.fromAirport', {
                              km: Math.abs(province.kmFromHavana),
                            })
                          : t('route.arrivalCity')
                        : t('route.drive', { km: leg?.km ?? 0 })}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      aria-label={t('route.stopFewer', { name: province.name })}
                      disabled={stop.nights <= 1}
                      onClick={() =>
                        patchStop(stop.province, { nights: stop.nights - 1 })
                      }
                    >
                      <Icon name="minus" className="h-4 w-4" />
                    </Button>
                    <span className="w-16 text-center font-mono text-body-sm">
                      {t('route.stopNights', { count: stop.nights })}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      aria-label={t('route.stopMore', { name: province.name })}
                      disabled={stop.nights >= 30}
                      onClick={() =>
                        patchStop(stop.province, { nights: stop.nights + 1 })
                      }
                    >
                      <Icon name="plus" className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="tertiary"
                      aria-label={t('route.stopRemove', { name: province.name })}
                      onClick={() => toggleProvince(stop.province)}
                    >
                      <Icon name="x" className="h-4 w-4" />
                    </Button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {route.length > 0 && diff !== 0 ? (
          <Alert variant="warning">
            {diff > 0
              ? t('route.short', { count: diff })
              : t('route.over', { count: -diff })}
          </Alert>
        ) : null}
        {summary.needsFlight ? (
          <Alert variant="info">{t('route.longLeg', { km: FLIGHT_LEG_KM })}</Alert>
        ) : null}
      </section>

      <RadioGroup legend={t('route.pace')} className={card}>
        {BUILDER_PACES.map((id) => (
          <Radio
            key={id}
            name="build-pace"
            value={id}
            checked={pace === id}
            onChange={() => setPace(id)}
            label={t(`route.paces.${id}.label`)}
            description={t(`route.paces.${id}.hint`)}
          />
        ))}
      </RadioGroup>

      <fieldset className={card}>
        <legend className="mb-1 text-body-sm font-semibold text-default">
          {t('route.interests')}
        </legend>
        <div className="flex flex-wrap gap-2">
          {BUILDER_INTERESTS.map((id) => {
            const on = interests.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setInterests((list) =>
                    on ? list.filter((value) => value !== id) : [...list, id],
                  )
                }
                className={chip(on)}
              >
                {t(`route.interestNames.${id}`)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Link
        href="/packages"
        className="self-start text-body-sm text-primary-600 underline underline-offset-[3px]"
      >
        ← {t('route.browse')}
      </Link>
    </div>
  );

  const transportStep = (
    <div className="flex flex-col gap-6">
      {stepHead(t('transport.title'), t('transport.lede'))}
      {builder ? (
        <RadioGroup legend={t('steps.transport')} className={card}>
          {builder.transports.map((option) => (
            <Radio
              key={option.key}
              name="build-transport"
              value={option.key}
              checked={transport === option.key}
              onChange={() => setTransport(option.key)}
              label={`${t(`transport.options.${option.key}.name`)} · ${t(
                'transport.perDay',
                {
                  amount: money(option.pricePerPersonDay),
                },
              )}`}
              description={t(`transport.options.${option.key}.description`)}
            />
          ))}
        </RadioGroup>
      ) : (
        <Alert>{t('transport.none')}</Alert>
      )}
    </div>
  );

  const staysStep = (
    <div className="flex flex-col gap-6">
      {stepHead(t('stays.title'), t('stays.lede'))}
      {route.map((stop, index) => {
        const province = byCode.get(stop.province)!;
        return (
          <section key={stop.province} className={card}>
            <h3 className="text-body font-semibold text-default">
              {t('stays.stop', {
                index: index + 1,
                name: province.name,
                nights: t('route.stopNights', { count: stop.nights }),
              })}
            </h3>
            {builder ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`build-stay-${stop.province}`}>
                  {t('stays.styleFor', { name: province.name })}
                </Label>
                <Select
                  id={`build-stay-${stop.province}`}
                  value={stop.stay ?? ''}
                  onChange={(event) =>
                    patchStop(stop.province, { stay: event.target.value })
                  }
                >
                  {builder.stayStyles.map((style) => (
                    <option key={style.key} value={style.key}>
                      {t(`stays.styles.${style.key}`)} ·{' '}
                      {t('stays.perNight', { amount: money(style.pricePerNight) })}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </section>
        );
      })}
      <div className={card}>
        <Checkbox
          checked={stepFree}
          onChange={(event) => setStepFree(event.target.checked)}
          label={t('stays.stepFree')}
          description={t('stays.stepFreeHint')}
        />
      </div>
    </div>
  );

  const activitiesStep = (
    <div className="flex flex-col gap-6">
      {stepHead(t('activities.title'), t('activities.lede'))}
      {route.map((stop, index) => {
        const province = byCode.get(stop.province)!;
        const here = activities.filter((activity) => activity.province === stop.province);
        return (
          <fieldset key={stop.province} className={card}>
            <legend className="mb-1 text-body font-semibold text-default">
              {index + 1}. {province.name}
            </legend>
            {here.length === 0 ? (
              <p className="text-body-sm text-muted">
                {t('activities.none', { name: province.name })}
              </p>
            ) : (
              here.map((activity) => (
                <Checkbox
                  key={activity.id}
                  checked={chosen.includes(activity.id)}
                  onChange={(event) =>
                    setChosen((list) =>
                      event.target.checked
                        ? [...list, activity.id]
                        : list.filter((value) => value !== activity.id),
                    )
                  }
                  label={activity.name}
                  description={t('activities.perPerson', {
                    amount: plainSpaces(
                      formatMoney(activity.price, activity.currency, locale),
                    ),
                  })}
                />
              ))
            )}
          </fieldset>
        );
      })}
      <RadioGroup legend={t('activities.guiding')} className={card}>
        {GUIDING_CHOICES.map((id) => (
          <Radio
            key={id}
            name="build-guiding"
            value={id}
            checked={guiding === id}
            onChange={() => setGuiding(id)}
            label={
              id === 'none' || !builder
                ? t(`activities.guides.${id}.name`)
                : `${t(`activities.guides.${id}.name`)} · ${t(
                    `activities.guides.${id}.price`,
                    {
                      amount: money(
                        id === 'shared'
                          ? builder.guiding.sharedPerPersonDay
                          : builder.guiding.privatePerGroupDay,
                      ),
                    },
                  )}`
            }
            description={t(`activities.guides.${id}.description`)}
          />
        ))}
      </RadioGroup>
      <div className={card}>
        <Checkbox
          checked={interpreter}
          onChange={(event) => setInterpreter(event.target.checked)}
          label={t('activities.interpreter')}
          description={
            builder
              ? t('activities.interpreterHint', {
                  amount: money(builder.interpreterPerGroupDay),
                })
              : undefined
          }
        />
      </div>
    </div>
  );

  const editLink = (target: number) => (
    <Button type="button" size="sm" variant="tertiary" onClick={() => go(target)}>
      {t('summary.edit')}
    </Button>
  );
  const usTraveler = nationality === 'US';

  const summaryStep = (
    <div className="flex flex-col gap-6">
      {stepHead(t('summary.title'), t('summary.lede'))}
      <dl className={cn(card, 'gap-0 divide-y p-0')}>
        <div className="flex flex-wrap items-start justify-between gap-2 p-5">
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-body-sm font-semibold text-default">
              {t('summary.route')}
            </dt>
            <dd className="text-body-sm text-secondary">
              {route
                .map(
                  (stop) =>
                    `${byCode.get(stop.province)!.name} (${t('route.stopNights', {
                      count: stop.nights,
                    })})`,
                )
                .join(' → ')}
            </dd>
            <dd className="text-caption text-muted">
              {t('summary.from', {
                date: arrival ? day(arrival) : '—',
                nights: nightsLabel,
                party,
                pace: t(`route.paces.${pace}.label`),
              })}
            </dd>
          </div>
          {editLink(1)}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-2 p-5">
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-body-sm font-semibold text-default">
              {t('summary.transportStays')}
            </dt>
            <dd className="text-body-sm text-secondary">
              {transport
                ? t(`transport.options.${transport}.name`)
                : t('summary.noTransport')}
            </dd>
            {builder ? (
              <dd className="text-caption text-muted">
                {route
                  .map(
                    (stop) =>
                      `${byCode.get(stop.province)!.name}: ${t(`stays.styles.${stop.stay ?? builder.defaultStayStyle}`)}`,
                  )
                  .join(' · ')}
              </dd>
            ) : null}
          </div>
          {editLink(2)}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-2 p-5">
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-body-sm font-semibold text-default">
              {t('summary.activities')}
            </dt>
            <dd className="text-body-sm text-secondary">
              {t('summary.activityCount', { count: picked.length })} ·{' '}
              {t(`activities.guides.${guiding}.name`)}
            </dd>
            {picked.length > 0 ? (
              <dd className="text-caption text-muted">
                {picked.map((activity) => activity.name).join(' · ')}
              </dd>
            ) : null}
          </div>
          {editLink(4)}
        </div>
      </dl>

      <div className={cn(card, 'grid gap-4 sm:grid-cols-2')}>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="build-nationality">{t('summary.nationality')}</Label>
          <Select
            id="build-nationality"
            value={nationality}
            onChange={(event) => setNationality(event.target.value)}
          >
            <option value="">{t('summary.nationalityNone')}</option>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="build-language">{t('summary.language')}</Label>
          <Select
            id="build-language"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            {locales.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="build-budget">{t('summary.budget')}</Label>
          <Input
            id="build-budget"
            type="number"
            min={0}
            step={10}
            inputMode="numeric"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
          />
        </div>
        {usTraveler ? (
          <Alert variant="info" className="sm:col-span-2">
            {t('summary.usNote')}
          </Alert>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="build-notes">{t('summary.notesLabel')}</Label>
          <Textarea
            id="build-notes"
            rows={4}
            maxLength={2000}
            value={notes}
            placeholder={t('summary.notesPlaceholder')}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        <p className="text-caption text-muted sm:col-span-2">
          {t.rich('summary.privacy', {
            link: (chunks) => (
              <Link
                href="/legal/privacy"
                className="text-primary-600 underline underline-offset-[3px]"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
    </div>
  );

  const content = [routeStep, transportStep, staysStep, activitiesStep, summaryStep][
    step - 1
  ];

  const aside = (
    <aside
      aria-label={t('estimate.label')}
      className="flex min-w-0 flex-col gap-4 rounded-lg border bg-surface p-6 shadow-md lg:sticky lg:top-24"
    >
      <p className="text-body font-semibold text-default">{t('estimate.title')}</p>
      {!builder ? (
        <p className="text-body-sm text-muted">{t('estimate.unavailable')}</p>
      ) : estimate && estimate.nights > 0 ? (
        <>
          <p className="font-mono text-h3 text-default">
            {t('estimate.range', {
              low: money(estimate.low),
              high: money(estimate.high),
            })}
          </p>
          <p className="text-caption text-muted">
            {t('estimate.lede', {
              nights: t('route.stopNights', { count: estimate.nights }),
              party,
            })}
          </p>
          <dl className="flex flex-col gap-1.5 border-t pt-3 text-body-sm">
            {(
              [
                [
                  t('estimate.stays', {
                    nights: t('route.stopNights', { count: estimate.nights }),
                  }),
                  estimate.stays,
                ],
                [t('estimate.transport'), estimate.transport],
                [t('estimate.activities', { count: picked.length }), estimate.activities],
                [t('estimate.guides'), estimate.guides],
                [t('estimate.offset'), estimate.offset],
                [t('estimate.fee', { percent: builder.feePercent }), estimate.fee],
              ] as const
            ).map(([label, amount]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-secondary">{label}</dt>
                <dd className="whitespace-nowrap font-mono text-default">
                  {money(amount)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-caption text-muted">{t('estimate.excludes')}</p>
          {builder.status === 'placeholder' ? (
            <Alert variant="info">{t('estimate.sample')}</Alert>
          ) : null}
        </>
      ) : (
        <p className="text-body-sm text-muted">{t('estimate.none')}</p>
      )}
      <div className="flex flex-col gap-2 border-t pt-3">
        <p className="text-body-sm font-semibold text-default">
          {t('estimate.routeTitle')}
        </p>
        {route.length === 0 ? (
          <p className="text-body-sm text-muted">{t('estimate.routeEmpty')}</p>
        ) : (
          <ol className="flex flex-col gap-1 text-body-sm">
            {route.map((stop, index) => (
              <li key={stop.province} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {index + 1}. {byCode.get(stop.province)!.name}
                </span>
                <span className="whitespace-nowrap font-mono text-muted">
                  {t('route.stopNights', { count: stop.nights })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex flex-col gap-6">
      <Stepper
        className="mx-auto w-full max-w-[760px]"
        steps={STEP_IDS.map((id, index) => ({
          id,
          label: t(`steps.${id}`),
          state: index + 1 < step ? 'done' : index + 1 === step ? 'current' : 'upcoming',
        }))}
        progressLabel={t('progress', {
          step,
          total: STEP_IDS.length,
          label: t(`steps.${STEP_IDS[step - 1]!}`),
        })}
      />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-6">
          {content}
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          <div className="flex flex-wrap justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={step === 1 || busy}
              onClick={() => go(step - 1)}
            >
              {t('back')}
            </Button>
            {step < STEP_IDS.length ? (
              <Button
                type="button"
                disabled={(step === 1 && !routeReady) || busy}
                onClick={() => go(step + 1)}
              >
                {t('continue')}
              </Button>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <Button type="button" disabled={!routeReady || busy} onClick={submit}>
                  {busy ? t('summary.submitting') : t('summary.submit')}
                </Button>
                <p className="text-caption text-muted">{t('summary.nothingCharged')}</p>
              </div>
            )}
          </div>
        </div>
        {aside}
      </div>
    </div>
  );
}

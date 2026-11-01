import { cubaProvinceName } from '@ota/domain';
import { DEFAULT_LOCALE } from '@ota/i18n';
import {
  eventsPageContentSchema,
  type EventLinkTargetsDto,
  type MeProfileDto,
} from '@ota/schemas';
import { Alert, Badge, buttonClassName, cn } from '@ota/ui';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Breadcrumb } from '@/components/breadcrumb';
import { EventRequestForm } from '@/components/events/event-request-form';
import { Link } from '@/i18n/navigation';
import { apiFetch, getServerSession } from '@/lib/api';
import { getPageContent } from '@/lib/content';
import { getDisplayCurrency } from '@/lib/currency';
import { countryOptions } from '@/lib/countries';
import { browsingPrice } from '@/lib/display-money';
import { eventDateLine, nightLabel } from '@/lib/event-dates';
import { getEvent } from '@/lib/events';
import { plainSpaces } from '@/lib/format';
import { getGeography, provinceName } from '@/lib/geography';
import { getTenantConfig } from '@/lib/tenant';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEvent(slug);
  return { title: event?.name ?? 'Event' };
}

/**
 * One event (Concierge / M-Concierge boards, M10): the dates, the access, the
 * three steps and the request behind sign-in. A guide-only event takes no
 * seats; it points to the custom builder instead.
 */
export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) {
    notFound();
  }
  const [t, nav, locale, session, content] = await Promise.all([
    getTranslations('events'),
    getTranslations('nav'),
    getLocale(),
    getServerSession(),
    getPageContent('events', eventsPageContentSchema),
  ]);
  const tenant = getTenantConfig();
  const concierge = tenant.concierge;
  const fee = plainSpaces(
    browsingPrice(
      concierge.feePerSeat,
      concierge.currency,
      await getDisplayCurrency(),
      locale,
    ),
  );
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  const signInHref = `/login?next=${encodeURIComponent(`${prefix}/events/${event.slug}`)}`;
  const takesRequests = event.access !== 'GUIDE_ONLY';

  const [me, linkTargets] =
    session && takesRequests
      ? await Promise.all([
          apiFetch<MeProfileDto>('/me').catch(() => null),
          apiFetch<EventLinkTargetsDto>(
            `/me/event-requests/link-targets?event=${encodeURIComponent(event.slug)}`,
          ).catch(() => ({ bookings: [], customRequests: [] })),
        ])
      : [null, { bookings: [], customRequests: [] }];
  const showForm = Boolean(takesRequests && session && me);
  const afterOptions = (getGeography()?.provinces ?? [])
    .filter((province) => province.network !== 'none')
    .sort((a, b) => a.kmFromHavana - b.kmFromHavana)
    .map((province) => ({ code: province.code, name: provinceName(province.code) }));

  return (
    <div className="mx-auto flex w-full max-w-container flex-col gap-8 px-4 py-8 sm:px-6 md:px-8 md:py-10 lg:px-10">
      <Breadcrumb
        label={t('breadcrumb')}
        items={[
          { label: nav('home'), href: '/' },
          { label: nav('events'), href: '/events' },
          { label: event.name },
        ]}
      />

      {content?.status === 'placeholder' ? (
        <Alert variant="info" title={t('sampleTitle')}>
          {t('sampleText', { agency: tenant.branding.agencyName })}
        </Alert>
      ) : null}

      <header className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <p className="text-overline uppercase text-secondary-600">
            {content?.eyebrow ?? t('eyebrow')}
          </p>
          <h1 className="text-h1-compact text-default md:text-display-2">{event.name}</h1>
          <p className="text-body-lg font-medium text-default">
            {eventDateLine(event, locale, t('datesTbc'))} · {event.place} ·{' '}
            {cubaProvinceName(event.province)}
          </p>
          <Badge variant={takesRequests ? 'info' : 'secondary'} className="self-start">
            {t(`access.${event.access}`)}
          </Badge>
          <p className="max-w-prose text-body-lg text-secondary">{event.summary}</p>
          {event.notes ? <p className="text-body-sm text-muted">{event.notes}</p> : null}
          {content ? (
            <p className="max-w-prose text-body-sm text-secondary">
              {content.fallThrough}
            </p>
          ) : null}
        </div>

        {takesRequests ? (
          <ol className="flex min-w-0 flex-col gap-4 rounded-lg border bg-surface p-5">
            {(['one', 'two', 'three'] as const).map((key, index) => (
              <li key={key} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-600 font-semibold text-on-primary"
                >
                  {index + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="font-semibold text-default">{t(`steps.${key}.title`)}</p>
                  <p className="text-body-sm text-secondary">
                    {t(`steps.${key}.text`, {
                      hours: event.answerHours,
                      fee,
                      confirmBy: event.confirmBy
                        ? plainSpaces(
                            new Intl.DateTimeFormat(locale, {
                              timeZone: 'UTC',
                              dateStyle: 'long',
                            }).format(new Date(event.confirmBy)),
                          )
                        : t('confirmByLater'),
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
      </header>

      {/* The form lists the nights itself; the programme is for everyone else. */}
      {event.nights.length > 0 && !showForm ? (
        <section aria-labelledby="programme-title" className="flex flex-col gap-3">
          <h2 id="programme-title" className="font-display text-h2-compact text-default">
            {t('programme')}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {event.nights.map((night) => (
              <li
                key={night.id}
                className="flex min-w-0 flex-col rounded-md border bg-surface p-4"
              >
                <span className="text-body-sm font-medium text-secondary-600">
                  {nightLabel(night.date, locale)}
                </span>
                <span className="font-semibold text-default">{night.label}</span>
                {night.venue ? (
                  <span className="text-body-sm text-muted">{night.venue}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        id="request"
        aria-labelledby="request-title"
        className="flex scroll-mt-8 flex-col gap-5 rounded-lg border bg-surface p-5 md:p-8"
      >
        <h2 id="request-title" className="font-display text-h2-compact text-default">
          {takesRequests ? t('requestTitle') : t('guideTitle')}
        </h2>
        {!takesRequests ? (
          <>
            <p className="max-w-prose text-body text-secondary">{t('guideText')}</p>
            <Link
              href="/custom"
              className={cn(buttonClassName({ variant: 'primary' }), 'self-start')}
            >
              {t('planTrip')}
            </Link>
          </>
        ) : showForm && me ? (
          <EventRequestForm
            event={event}
            maxSeats={concierge.maxSeats}
            feePerSeat={concierge.feePerSeat}
            currency={concierge.currency}
            linkTargets={linkTargets}
            afterOptions={afterOptions}
            needsPhone={!me.phone}
            needsNationality={!me.nationality}
            countries={countryOptions(locale)}
            email={me.email}
            arrivalAdvice={content?.arrivalAdvice ?? null}
            usNote={content?.usNote ?? null}
          />
        ) : (
          <>
            <p className="max-w-prose text-body text-secondary">{t('signInText')}</p>
            <Link
              href={signInHref}
              className={cn(buttonClassName({ variant: 'primary' }), 'self-start')}
            >
              {t('signIn')}
            </Link>
          </>
        )}
      </section>

      {content && content.honestNotes.length > 0 ? (
        <section aria-labelledby="notes-title" className="flex flex-col gap-3">
          <h2 id="notes-title" className="font-display text-h2-compact text-default">
            {t('honestNotes')}
          </h2>
          <ul className="flex max-w-prose list-disc flex-col gap-1.5 pl-5 text-body text-secondary">
            {content.honestNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

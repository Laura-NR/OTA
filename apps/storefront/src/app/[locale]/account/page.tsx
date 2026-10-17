import { conditionsContentSchema } from '@ota/schemas';
import { DEFAULT_LOCALE } from '@ota/i18n';
import type {
  MeProfileDto,
  MyConsentDto,
  MyReservationDetailDto,
  MyReservationListItemDto,
} from '@ota/schemas';
import { Badge, buttonClassName, Icon } from '@ota/ui';
import type { Metadata } from 'next';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { AccountShell, type AccountSection } from '@/components/account/account-shell';
import { NotificationPreferences } from '@/components/account/notification-preferences';
import { TripProgress } from '@/components/account/trip-progress';
import { CheckoutButton } from '@/components/checkout-button';
import { TONE_BADGES } from '@/components/conditions-card';
import { TravelerStatusBadge } from '@/components/traveler-status-badge';
import { Link } from '@/i18n/navigation';
import { apiFetch, getServerSession } from '@/lib/api';
import { getPageContent } from '@/lib/content';
import { formatMoney } from '@/lib/format';
import { getTenantConfig } from '@/lib/tenant';

/** Bookings that are over, one way or another, and leave the "next trip" race. */
const CLOSED = new Set(['COMPLETED', 'CANCELLED']);

/** How many trips the Documents section opens to list their files. */
const DOCUMENT_TRIPS = 10;

const DAY_MS = 86_400_000;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('account');
  return { title: t('title') };
}

function section(tab: string | undefined): AccountSection {
  return tab === 'trips' ||
    tab === 'documents' ||
    tab === 'messages' ||
    tab === 'preferences'
    ? tab
    : 'overview';
}

/**
 * Account (Account / M-Account boards): the traveler's next trip with its
 * progress and what is waiting on them, then their trips, documents, message
 * threads and notification preferences, each a section of the same frame
 * (`?tab=`).
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getServerSession();
  if (!session) {
    const locale = await getLocale();
    redirect(locale === DEFAULT_LOCALE ? '/login' : `/${locale}/login`);
  }

  const current = section((await searchParams).tab);
  const [t, format, locale, profile, reservations, conditions] = await Promise.all([
    getTranslations('account'),
    getFormatter(),
    getLocale(),
    apiFetch<MeProfileDto>('/me').catch(() => null),
    apiFetch<MyReservationListItemDto[]>('/me/reservations'),
    getPageContent('conditions', conditionsContentSchema),
  ]);
  const tenant = getTenantConfig();
  const consents =
    current === 'preferences'
      ? await apiFetch<MyConsentDto[]>(`/me/consents?locale=${locale}`).catch(() => [])
      : [];
  const name = profile?.fullName ?? session.user.name ?? null;
  const firstName = name?.split(/\s+/)[0] ?? null;

  const dates = (reservation: MyReservationListItemDto) =>
    format.dateTimeRange(new Date(reservation.startDate), new Date(reservation.endDate), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const total = (reservation: MyReservationListItemDto) =>
    formatMoney(reservation.totalAmount, reservation.totalCurrency, locale);

  const open = reservations
    .filter((reservation) => !CLOSED.has(reservation.status))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const today = new Date().toISOString().slice(0, 10);
  const next =
    open.find((reservation) => reservation.startDate.slice(0, 10) >= today) ?? open[0];
  const daysToGo = next
    ? Math.ceil((new Date(next.startDate).getTime() - Date.now()) / DAY_MS)
    : 0;
  const past = reservations
    .filter((reservation) => reservation.status === 'COMPLETED')
    .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  const toPay = open.filter(
    (reservation) =>
      reservation.status === 'SECURED_AND_INVOICED' ||
      reservation.status === 'PENDING_PAYMENT',
  );
  const blocked = open.filter((reservation) => reservation.status === 'ACTION_REQUIRED');
  const documents = reservations.reduce(
    (sum, reservation) => sum + reservation.documentCount,
    0,
  );

  const withDocuments =
    current === 'documents'
      ? await Promise.all(
          reservations
            .filter((reservation) => reservation.documentCount > 0)
            .slice(0, DOCUMENT_TRIPS)
            .map((reservation) =>
              apiFetch<MyReservationDetailDto>(
                `/me/reservations/${reservation.id}`,
              ).catch(() => null),
            ),
        )
      : [];
  const td = await getTranslations('status.document');

  const tripCard = (reservation: MyReservationListItemDto) => (
    <li key={reservation.id}>
      <article className="flex flex-col gap-3 rounded-lg border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-mono text-body font-semibold">
            <Link
              href={`/account/reservations/${reservation.id}`}
              className="text-primary-600 underline underline-offset-[3px] hover:text-primary-700"
            >
              {reservation.bookingCode}
            </Link>
          </h3>
          <TravelerStatusBadge status={reservation.status} />
        </div>
        <p className="text-body-sm text-secondary">
          {dates(reservation)} ·{' '}
          {t('serviceCount', { count: reservation.serviceItemCount })} ·{' '}
          {t('documentCount', { count: reservation.documentCount })}
        </p>
        <p className="text-body font-semibold text-default">{total(reservation)}</p>
      </article>
    </li>
  );

  return (
    <AccountShell
      current={current}
      name={name}
      email={session.user.email}
      counts={{
        trips: open.length || undefined,
        documents: documents || undefined,
      }}
      emergency={tenant.emergencyContacts[0] ?? null}
    >
      {current === 'overview' ? (
        <>
          <header className="flex flex-col gap-1.5">
            <p className="text-overline uppercase text-primary-600">
              {t('nav.overview')}
            </p>
            <h1 className="text-h1-compact text-default md:text-h1">
              {firstName ? t('greeting', { name: firstName }) : t('greetingAnon')}{' '}
              {daysToGo > 0 ? t('countdown', { days: daysToGo }) : null}
            </h1>
          </header>

          {next ? (
            <section
              aria-labelledby="next-trip"
              className="flex flex-col gap-5 rounded-lg border bg-surface p-6"
            >
              <div className="flex flex-wrap items-start gap-4">
                <span
                  aria-hidden="true"
                  className="hidden h-20 w-32 shrink-0 rounded-md bg-sunken sm:block"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <TravelerStatusBadge status={next.status} />
                    <span className="font-mono text-caption text-muted">
                      {t('bookingCode', { code: next.bookingCode })}
                    </span>
                  </div>
                  <h2
                    id="next-trip"
                    className="font-display text-h2-compact text-default"
                  >
                    {t('nextTrip')}
                  </h2>
                  <p className="text-body-sm text-secondary">
                    {dates(next)} · {t('serviceCount', { count: next.serviceItemCount })}
                  </p>
                </div>
              </div>
              <TripProgress status={next.status} />
              <div className="flex flex-wrap gap-3 border-t pt-4">
                <Link
                  href={`/account/reservations/${next.id}`}
                  className={buttonClassName({ size: 'lg' })}
                >
                  {t('viewItinerary')}
                </Link>
                <Link
                  href={`/account/reservations/${next.id}#messages`}
                  className={buttonClassName({ variant: 'secondary', size: 'lg' })}
                >
                  <Icon name="message-circle" />
                  {t('messageUs')}
                </Link>
              </div>
            </section>
          ) : (
            <section className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
              <p className="text-body text-secondary">{t('empty')}</p>
              <div className="flex flex-wrap gap-3">
                <Link href="/packages" className={buttonClassName()}>
                  {t('browse')}
                </Link>
                <Link
                  href="/custom"
                  className={buttonClassName({ variant: 'secondary' })}
                >
                  {t('custom')}
                </Link>
              </div>
            </section>
          )}

          {toPay.length > 0 || blocked.length > 0 ? (
            <section aria-labelledby="tasks" className="flex flex-col gap-3">
              <h2 id="tasks" className="text-h4 text-default">
                {t('tasks.title')}
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {toPay.map((reservation) => (
                  <li
                    key={reservation.id}
                    className="flex flex-col items-start gap-2 rounded-lg border border-accent-500 bg-accent-50 p-5"
                  >
                    <p className="text-body font-semibold text-default">
                      {t('tasks.pay', {
                        code: reservation.bookingCode,
                        amount: total(reservation),
                      })}
                    </p>
                    <p className="text-body-sm text-secondary">{t('tasks.payText')}</p>
                    <CheckoutButton reservationId={reservation.id} />
                  </li>
                ))}
                {blocked.map((reservation) => (
                  <li
                    key={reservation.id}
                    className="flex flex-col items-start gap-2 rounded-lg border border-warning-500 bg-warning-100 p-5"
                  >
                    <p className="text-body font-semibold text-warning-700">
                      {t('tasks.action', { code: reservation.bookingCode })}
                    </p>
                    <p className="text-body-sm text-warning-700">
                      {t('tasks.actionText')}
                    </p>
                    <Link
                      href={`/account/reservations/${reservation.id}#messages`}
                      className={buttonClassName({ variant: 'secondary', size: 'sm' })}
                    >
                      {t('tasks.openMessages')}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="grid items-start gap-6 xl:grid-cols-2">
            {conditions ? (
              <section
                aria-labelledby="account-conditions"
                className="flex flex-col gap-3 rounded-lg border bg-surface p-6"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="account-conditions" className="text-h4 text-default">
                    {conditions.eyebrow ?? conditions.title}
                  </h2>
                  {conditions.status === 'placeholder' ? (
                    <Badge variant="outline">{t('sample')}</Badge>
                  ) : null}
                </div>
                <ul className="flex flex-col gap-2">
                  {conditions.items.map((item) => (
                    <li
                      key={item.topic}
                      className="flex flex-wrap items-center justify-between gap-2 text-body-sm"
                    >
                      <span className="text-default">{item.label}</span>
                      <Badge
                        variant={TONE_BADGES[item.tone]}
                        className="h-auto min-h-6 whitespace-normal py-0.5"
                      >
                        {item.value}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/travel-info"
                  className="self-start text-body-sm font-semibold text-primary-600 underline underline-offset-[3px]"
                >
                  {t('fullBriefing')}
                </Link>
              </section>
            ) : null}
            {past ? (
              <section
                aria-labelledby="past-trip"
                className="flex flex-col gap-3 rounded-lg border bg-surface p-6"
              >
                <h2 id="past-trip" className="text-h4 text-default">
                  {t('pastTrip')}
                </h2>
                <p className="text-body-sm text-secondary">
                  <span className="font-mono">{past.bookingCode}</span> · {dates(past)}
                </p>
                <Link
                  href={`/account/reservations/${past.id}`}
                  className={buttonClassName({ variant: 'secondary', size: 'sm' })}
                >
                  {t('rateTrip')}
                </Link>
              </section>
            ) : null}
          </div>
        </>
      ) : null}

      {current === 'trips' ? (
        <section aria-labelledby="trips-title" className="flex flex-col gap-4">
          <h1 id="trips-title" className="text-h1-compact text-default md:text-h1">
            {t('title')}
          </h1>
          {reservations.length === 0 ? (
            <p className="text-body text-secondary">{t('empty')}</p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">{reservations.map(tripCard)}</ul>
          )}
        </section>
      ) : null}

      {current === 'documents' ? (
        <section aria-labelledby="documents-title" className="flex flex-col gap-4">
          <h1 id="documents-title" className="text-h1-compact text-default md:text-h1">
            {t('documents')}
          </h1>
          {withDocuments.length === 0 ? (
            <p className="text-body text-secondary">{t('documentsEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {withDocuments.flatMap((reservation) =>
                reservation
                  ? [
                      <li
                        key={reservation.id}
                        className="flex flex-col gap-3 rounded-lg border bg-surface p-5"
                      >
                        <h2 className="font-mono text-body font-semibold text-default">
                          {reservation.bookingCode}
                        </h2>
                        <ul className="flex flex-col gap-2">
                          {reservation.documents.map((document) => (
                            <li
                              key={document.id}
                              className="flex flex-wrap items-center justify-between gap-3 text-body-sm"
                            >
                              <span className="flex items-center gap-2 text-default">
                                <Icon name="file-text" className="h-4 w-4 text-muted" />
                                {td(document.type)}
                              </span>
                              <a
                                href={`/api/ota/documents/${document.id}/download`}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-primary-600 underline underline-offset-[3px]"
                              >
                                {t('download')}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </li>,
                    ]
                  : [],
              )}
            </ul>
          )}
        </section>
      ) : null}

      {current === 'messages' ? (
        <section aria-labelledby="messages-title" className="flex flex-col gap-4">
          <h1 id="messages-title" className="text-h1-compact text-default md:text-h1">
            {t('messages.title')}
          </h1>
          <p className="text-body text-secondary">{t('messagesLede')}</p>
          {reservations.length === 0 ? (
            <p className="text-body text-secondary">{t('empty')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {reservations.map((reservation) => (
                <li
                  key={reservation.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface p-4"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-body font-semibold">
                      {reservation.bookingCode}
                    </span>
                    <TravelerStatusBadge status={reservation.status} />
                  </span>
                  <Link
                    href={`/account/reservations/${reservation.id}#messages`}
                    className={buttonClassName({ variant: 'secondary', size: 'sm' })}
                  >
                    {t('openThread')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {current === 'preferences' ? (
        <section aria-labelledby="preferences-title" className="flex flex-col gap-4">
          <h1 id="preferences-title" className="text-h1-compact text-default md:text-h1">
            {t('preferences.title')}
          </h1>
          <NotificationPreferences consents={consents} />
        </section>
      ) : null}
    </AccountShell>
  );
}

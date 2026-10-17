import {
  hasConfirmation,
  preTripSteps,
  tripCalendar,
  type PreTripStep,
} from '@ota/domain';
import { DEFAULT_LOCALE } from '@ota/i18n';
import type {
  MyReservationDetailDto,
  PaymentScheduleDto,
  ReservationOfacDto,
} from '@ota/schemas';
import { Alert, Badge, buttonClassName, cn, Icon, type IconName } from '@ota/ui';
import type { Metadata } from 'next';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { ReviewForm } from '@/components/review-form';
import { TravelerStatusBadge } from '@/components/traveler-status-badge';
import { Link } from '@/i18n/navigation';
import { apiFetch, getServerSession } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { getTenantConfig } from '@/lib/tenant';

/** The documents a traveler holds; the supplier work orders are not theirs. */
const TRAVELER_DOCUMENTS = ['VOUCHER', 'INVOICE', 'RECEIPT', 'EMERGENCY_CONTACT'];

const SERVICE_ICONS: Record<string, IconName> = {
  ACCOMMODATION: 'home',
  TRANSPORTATION: 'route',
  GUIDE: 'users',
  EXPERIENCE: 'star',
};

/** A service a supplier has taken (or already delivered) is confirmed. */
const CONFIRMED_SERVICES = new Set(['ACCEPTED', 'FULFILLED']);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('confirmation');
  return { title: t('metaTitle') };
}

/**
 * The traveler's confirmation (Confirmation / M-Confirmation boards), reached
 * from the trip page once the first payment has confirmed the booking: what
 * was booked, what is left before departure, the documents, the services, the
 * money paid and due, and the review once the trip is over. Only data the
 * platform holds is drawn; the boards' offline kit, e-visa and insurance
 * documents, host contacts, impact and referral blocks are not (ADR 0006).
 */
export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const localized = (path: string) =>
    locale === DEFAULT_LOCALE ? path : `/${locale}${path}`;
  const session = await getServerSession();
  if (!session) {
    redirect(localized('/login'));
  }

  const [reservation, schedule, ofac] = await Promise.all([
    apiFetch<MyReservationDetailDto>(`/me/reservations/${id}?locale=${locale}`).catch(
      () => null,
    ),
    apiFetch<PaymentScheduleDto>(`/me/reservations/${id}/schedule`).catch(() => null),
    apiFetch<ReservationOfacDto>(`/me/reservations/${id}/ofac?locale=${locale}`).catch(
      () => null,
    ),
  ]);
  if (!reservation) {
    notFound();
  }
  const tripPath = `/account/reservations/${reservation.id}`;
  if (!hasConfirmation(reservation.status, Number(schedule?.paid ?? 0))) {
    redirect(localized(tripPath));
  }

  const [t, tk, td, tst, trv, format] = await Promise.all([
    getTranslations('confirmation'),
    getTranslations('account.payment.kinds'),
    getTranslations('status.document'),
    getTranslations('status.serviceType'),
    getTranslations('review'),
    getFormatter(),
  ]);
  const tenant = getTenantConfig();
  const now = new Date();
  const currency = schedule?.currency ?? reservation.totalCurrency;
  const money = (value: string) => formatMoney(value, currency, locale);
  // Trip dates and balance dates are calendar days stored at UTC midnight.
  const day = (value: string) =>
    format.dateTime(new Date(value), {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const dates = format.dateTimeRange(
    new Date(reservation.startDate),
    new Date(reservation.endDate),
    {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    },
  );

  const name = session.user.name?.trim() || null;
  const firstName = name?.split(/\s+/)[0] ?? null;
  const tripName = reservation.trip?.name ?? t('customTrip');
  const others = reservation.travelers
    .filter((traveler) => !traveler.isLead)
    .map((traveler) => traveler.fullName.split(/\s+/)[0]!);
  const party = format.list(
    reservation.travelers.map((traveler) => traveler.fullName),
    { type: 'conjunction' },
  );

  const instalments = schedule?.instalments ?? [];
  const next = instalments.find(
    (instalment) => instalment.id === schedule?.nextInstalmentId,
  );
  const paid = instalments.filter((instalment) => instalment.status === 'PAID');
  const railOf = (instalmentId: string) =>
    schedule?.receipts.find(
      (receipt) => receipt.instalmentId === instalmentId && receipt.status === 'PAID',
    )?.rail;
  const refunded = Number(schedule?.refunded ?? 0);
  const ofacMissing = ofac?.missing ?? 0;
  const steps = preTripSteps({
    status: reservation.status,
    ofacMissing,
    nextInstalment: next ?? null,
    now,
  });

  const documents = reservation.documents.filter((document) =>
    TRAVELER_DOCUMENTS.includes(document.type),
  );
  const voucher = documents.find((document) => document.type === 'VOUCHER');
  const download = (documentId: string) => `/api/ota/documents/${documentId}/download`;

  const calendar = tripCalendar({
    uid: `${reservation.bookingCode}@${tenant.tenantId}`,
    title: `${tripName} · ${reservation.bookingCode}`,
    description: t('calendarDescription', {
      code: reservation.bookingCode,
      agency: tenant.branding.agencyName,
    }),
    startDate: reservation.startDate,
    endDate: reservation.endDate,
    now,
  });

  const panel = 'flex flex-col gap-5 rounded-lg border bg-surface p-6 md:p-7';
  const sectionHead = (titleId: string, title: string, lede?: string) => (
    <div className="flex flex-col gap-1">
      <h2 id={titleId} className="text-h3 text-default">
        {title}
      </h2>
      {lede ? <p className="text-body-sm text-secondary">{lede}</p> : null}
    </div>
  );

  const stepView = (step: PreTripStep) => {
    switch (step.kind) {
      case 'CERTIFY':
        return {
          title: t('steps.certify'),
          text: t('steps.certifyText', { count: step.missing }),
          action: t('steps.certifyAction'),
          href: `${tripPath}#ofac-title`,
          tone: 'warning' as const,
        };
      case 'PAY':
        return {
          title: t(step.overdue ? 'steps.payOverdue' : 'steps.pay', {
            kind: tk(step.instalmentKind),
            amount: money(step.amount),
            date: day(step.dueAt),
          }),
          text: t(step.overdue ? 'steps.payOverdueText' : 'steps.payText'),
          action: t(step.overdue ? 'steps.payNow' : 'steps.payAction'),
          href: `${tripPath}#pay-title`,
          tone: step.overdue ? ('error' as const) : ('default' as const),
        };
      case 'TRAVEL_INFO':
        return {
          title: t('steps.travelInfo'),
          text: t('steps.travelInfoText'),
          action: t('steps.travelInfoAction'),
          href: '/travel-info',
          tone: 'default' as const,
        };
    }
  };

  const summary = (
    <aside
      aria-label={t('summary.label')}
      className="flex min-w-0 flex-col gap-4 rounded-lg border bg-surface p-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:self-start"
    >
      <div className="flex flex-col gap-1">
        <p className="text-h4 text-default">{tripName}</p>
        <p className="text-body-sm text-secondary">{dates}</p>
        {party || reservation.trip?.tier ? (
          <p className="text-body-sm text-secondary">
            {[party, reservation.trip?.tier].filter(Boolean).join(' · ')}
          </p>
        ) : null}
      </div>
      <div>
        <TravelerStatusBadge status={reservation.status} />
      </div>
      <dl className="flex flex-col gap-2 border-t pt-4 text-body-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-secondary">{t('summary.total')}</dt>
          <dd className="font-mono text-default">{money(reservation.totalAmount)}</dd>
        </div>
        {paid.length > 0 ? (
          paid.map((instalment) => {
            const rail = railOf(instalment.id);
            return (
              <div key={instalment.id} className="flex justify-between gap-3">
                <dt className="text-secondary">
                  {t('summary.paid', {
                    kind: tk(instalment.kind),
                    date: day(instalment.paidAt ?? instalment.dueAt),
                    rail: rail ? t(`summary.rails.${rail}`) : '—',
                  })}
                </dt>
                <dd className="whitespace-nowrap font-mono text-success-700">
                  − {money(instalment.amount)}
                </dd>
              </div>
            );
          })
        ) : (
          <div className="flex justify-between gap-3">
            <dt className="text-secondary">{t('summary.paidBefore')}</dt>
            <dd className="whitespace-nowrap font-mono text-success-700">
              − {money(schedule?.paid ?? '0')}
            </dd>
          </div>
        )}
        {refunded > 0 ? (
          <div className="flex justify-between gap-3">
            <dt className="text-secondary">{t('summary.refunded')}</dt>
            <dd className="whitespace-nowrap font-mono text-default">
              {money(String(refunded))}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 border-t pt-3 text-body font-semibold">
          {next ? (
            <>
              <dt>{t('summary.due', { kind: tk(next.kind), date: day(next.dueAt) })}</dt>
              <dd className="whitespace-nowrap font-mono">{money(next.amount)}</dd>
            </>
          ) : (
            <dt>{t('summary.paidInFull')}</dt>
          )}
        </div>
      </dl>
      {next && reservation.status === 'CONFIRMED' ? (
        <Link
          href={`${tripPath}#pay-title`}
          className={buttonClassName({ variant: 'secondary' })}
        >
          {t('summary.payEarly')}
        </Link>
      ) : null}
    </aside>
  );

  return (
    <div className="mx-auto flex w-full max-w-container flex-col gap-7 px-6 py-8 md:px-8 md:py-10 lg:px-10">
      <Link
        href={tripPath}
        className="self-start text-body-sm text-primary-600 underline underline-offset-[3px]"
      >
        ← {t('back', { code: reservation.bookingCode })}
      </Link>

      <section
        aria-labelledby="confirmation-title"
        className="flex flex-wrap items-start gap-6"
      >
        <span
          aria-hidden="true"
          className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-full bg-success-100 text-success-700 sm:inline-flex"
        >
          <Icon name="check" className="h-8 w-8" />
        </span>
        <div className="flex min-w-0 flex-1 basis-80 flex-col gap-2.5">
          <p className="text-overline uppercase text-success-700">
            {t('overline')} <span className="font-mono">{reservation.bookingCode}</span>
          </p>
          <h1
            id="confirmation-title"
            className="text-h1-compact text-default md:text-display-2"
          >
            {firstName ? t('title', { name: firstName }) : t('titleAnon')}
          </h1>
          <p className="max-w-[70ch] text-body text-secondary">
            {others.length > 0
              ? t('ledeParty', {
                  trip: tripName,
                  dates,
                  others: format.list(others, { type: 'conjunction' }),
                })
              : t('ledeSolo', { trip: tripName, dates })}{' '}
            {t('ledeDocuments')}
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            {voucher ? (
              <a
                href={download(voucher.id)}
                target="_blank"
                rel="noreferrer"
                className={buttonClassName()}
              >
                <Icon name="download" className="h-5 w-5" />
                {t('downloadVoucher')}
              </a>
            ) : null}
            <a
              href={`data:text/calendar;charset=utf-8,${encodeURIComponent(calendar)}`}
              download={`${reservation.bookingCode}.ics`}
              className={buttonClassName({ variant: 'secondary' })}
            >
              <Icon name="calendar" className="h-5 w-5" />
              {t('addToCalendar')}
            </a>
            <Link
              href={`${tripPath}#messages`}
              className={buttonClassName({ variant: 'secondary' })}
            >
              <Icon name="message-circle" className="h-5 w-5" />
              {t('messageUs')}
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:gap-10">
        {summary}

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          {steps.length > 0 ? (
            <section aria-labelledby="steps-title" className={panel}>
              {sectionHead('steps-title', t('steps.title'), t('steps.lede'))}
              <ol className="flex flex-col">
                {steps.map((step, index) => {
                  const view = stepView(step);
                  return (
                    <li
                      key={step.kind}
                      className="flex flex-wrap items-start gap-3 border-b py-3.5 last:border-b-0 last:pb-0"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-label',
                          index === 0
                            ? 'bg-accent-500 text-neutral-900'
                            : 'border-2 border-neutral-300 bg-surface text-muted',
                        )}
                      >
                        {index + 1}
                      </span>
                      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
                        <p
                          className={cn(
                            'text-body-sm font-semibold',
                            view.tone === 'error'
                              ? 'text-error-700'
                              : view.tone === 'warning'
                                ? 'text-warning-700'
                                : 'text-default',
                          )}
                        >
                          {view.title}
                        </p>
                        <p className="text-body-sm text-secondary">{view.text}</p>
                      </div>
                      <Link
                        href={view.href}
                        className={buttonClassName({
                          variant: step.kind === 'TRAVEL_INFO' ? 'tertiary' : 'secondary',
                          size: 'sm',
                        })}
                      >
                        {view.action}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          <section aria-labelledby="documents-title" className={panel}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              {sectionHead('documents-title', t('documents.title'), t('documents.lede'))}
              <Link
                href="/account?tab=documents"
                className="text-body-sm font-semibold text-primary-600 underline underline-offset-[3px]"
              >
                {t('documents.open')} →
              </Link>
            </div>
            {documents.length > 0 ? (
              <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(16rem,100%),1fr))]">
                {documents.map((document) => (
                  <li key={document.id} className="min-w-0">
                    <a
                      href={download(document.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-lg border bg-surface px-4 py-3.5 text-default hover:bg-neutral-100"
                    >
                      <Icon
                        name="file-text"
                        className="h-5 w-5 shrink-0 text-primary-600"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-body-sm font-semibold">
                          {td(document.type)}
                        </span>
                        <span className="text-caption text-muted">
                          {t('documents.issued', { date: day(document.generatedAt) })}
                          {' · '}
                          {t(`documents.details.${document.type}`)}
                        </span>
                      </span>
                      <Icon name="download" className="h-5 w-5 shrink-0 text-muted" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            {!voucher && ofacMissing > 0 ? (
              <Alert variant="warning">{t('documents.held')}</Alert>
            ) : documents.length === 0 ? (
              <Alert>{t('documents.empty')}</Alert>
            ) : null}
          </section>

          {reservation.serviceItems.length > 0 ? (
            <section aria-labelledby="services-title" className={panel}>
              {sectionHead('services-title', t('services.title'), t('services.lede'))}
              <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(13.75rem,100%),1fr))]">
                {reservation.serviceItems.map((item) => (
                  <ServiceCard
                    key={item.id}
                    icon={SERVICE_ICONS[item.serviceType] ?? 'package'}
                    title={[tst(item.serviceType), item.province]
                      .filter(Boolean)
                      .join(' · ')}
                    caption={format.dateTimeRange(
                      new Date(item.serviceDateStart),
                      new Date(item.serviceDateEnd),
                      { day: 'numeric', month: 'short' },
                    )}
                    status={
                      CONFIRMED_SERVICES.has(item.status)
                        ? t('services.confirmed')
                        : t('services.arranging')
                    }
                    confirmed={CONFIRMED_SERVICES.has(item.status)}
                  />
                ))}
                <li className="min-w-0">
                  <Link
                    href={`${tripPath}#messages`}
                    className="flex h-full items-center gap-3 rounded-lg border bg-primary-50 p-3 text-default hover:bg-primary-100"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-600 text-on-primary"
                    >
                      <Icon name="message-circle" className="h-5 w-5" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-body-sm font-semibold">
                        {t('services.desk')}
                      </span>
                      <span className="text-caption text-muted">
                        {t('services.deskText')}
                      </span>
                    </span>
                  </Link>
                </li>
              </ul>
            </section>
          ) : null}

          {reservation.status === 'COMPLETED' ? (
            <section aria-labelledby="review-title" className={panel}>
              {sectionHead('review-title', trv('title'))}
              <ReviewForm reservationId={reservation.id} review={reservation.review} />
            </section>
          ) : null}

          <p className="text-caption text-muted">
            {t.rich('advisory', {
              link: (chunks) => (
                <Link
                  href="/travel-info"
                  className="text-primary-600 underline underline-offset-[3px]"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

function ServiceCard({
  icon,
  title,
  caption,
  status,
  confirmed,
}: {
  icon: IconName;
  title: string;
  caption: string;
  status: string;
  confirmed: boolean;
}) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-lg border p-3">
      <span
        aria-hidden="true"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sunken text-secondary"
      >
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="break-words text-body-sm font-semibold text-default">
          {title}
        </span>
        <span className="text-caption text-muted">{caption}</span>
        <Badge variant={confirmed ? 'success' : 'secondary'} className="self-start">
          {status}
        </Badge>
      </span>
    </li>
  );
}

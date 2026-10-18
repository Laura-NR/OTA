import { OPS_TIME_ZONE, hasConfirmation } from '@ota/domain';
import { DEFAULT_LOCALE } from '@ota/i18n';
import type {
  MeDisruptionDto,
  MyReservationDetailDto,
  PaymentScheduleDto,
  ReservationOfacDto,
} from '@ota/schemas';
import {
  Alert,
  Badge,
  buttonClassName,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { AccountShell } from '@/components/account/account-shell';
import { DisruptionChoice } from '@/components/account/disruption-choice';
import { OfacCertification } from '@/components/account/ofac-certification';
import { PaymentSchedule } from '@/components/account/payment-schedule';
import { ProviderProgress } from '@/components/account/provider-progress';
import { TripProgress } from '@/components/account/trip-progress';
import { MessageThread } from '@/components/message-thread';
import { ReviewForm } from '@/components/review-form';
import { TravelerStatusBadge } from '@/components/traveler-status-badge';
import { Link } from '@/i18n/navigation';
import { apiFetch, getServerSession } from '@/lib/api';
import { formatMoney, plainSpaces } from '@/lib/format';
import { getTenantConfig } from '@/lib/tenant';

/** While the desk confirms the trip with its providers. */
const CONFIRMING: readonly string[] = [
  'ITINERARY_SUBMITTED',
  'DISPATCH_IN_PROGRESS',
  'ASSEMBLY_AND_ESCALATION',
  'ACTION_REQUIRED',
];

/**
 * One trip in the Account frame: its progress in the traveler's words, where
 * the provider requests stand while the desk confirms it, the link to the
 * confirmation once the first payment has confirmed it, the US
 * travel-category certification when a traveler needs it (M3), the payment
 * step when it is due (locked until every US traveler has certified), the
 * itinerary, the documents, the review once completed, and the thread with
 * operations (`#messages`). A disruption's options (M8) lead the page while the
 * case is open (`#disruption-options`, the E-Options link).
 */
export default async function AccountReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession();
  if (!session) {
    const locale = await getLocale();
    redirect(locale === DEFAULT_LOCALE ? '/login' : `/${locale}/login`);
  }

  const reservation = await apiFetch<MyReservationDetailDto>(
    `/me/reservations/${id}`,
  ).catch(() => null);
  if (!reservation) {
    notFound();
  }

  const [t, trv, tsi, tst, td, tdo, format, locale] = await Promise.all([
    getTranslations('account'),
    getTranslations('review'),
    getTranslations('status.serviceItem'),
    getTranslations('status.serviceType'),
    getTranslations('status.document'),
    getTranslations('disruptionOptions'),
    getFormatter(),
    getLocale(),
  ]);
  const tenant = getTenantConfig();
  const [ofac, schedule, disruptions] = await Promise.all([
    apiFetch<ReservationOfacDto>(`/me/reservations/${id}/ofac?locale=${locale}`).catch(
      () => null,
    ),
    apiFetch<PaymentScheduleDto>(`/me/reservations/${id}/schedule`).catch(() => null),
    apiFetch<MeDisruptionDto[]>(`/me/disruptions?reservationId=${id}`).catch(() => []),
  ]);
  const ofacRequired = ofac?.travelers.some((traveler) => traveler.required) ?? false;
  const ofacLocked = (ofac?.missing ?? 0) > 0;
  const confirmed = hasConfirmation(reservation.status, Number(schedule?.paid ?? 0));
  const card = 'flex flex-col gap-4 rounded-lg border bg-surface p-6';
  const when = (value: string) =>
    format.dateTime(new Date(value), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <AccountShell
      current="trips"
      name={session.user.name ?? null}
      email={session.user.email}
      counts={{}}
      emergency={tenant.emergencyContacts[0] ?? null}
    >
      <header className="flex flex-col gap-3">
        <Link
          href="/account?tab=trips"
          className="self-start text-body-sm text-primary-600 underline underline-offset-[3px]"
        >
          ← {t('back')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-h1-compact text-default">
            {reservation.bookingCode}
          </h1>
          <TravelerStatusBadge status={reservation.status} />
        </div>
        <p className="text-body text-secondary">
          {format.dateTimeRange(
            new Date(reservation.startDate),
            new Date(reservation.endDate),
            {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            },
          )}{' '}
          · {formatMoney(reservation.totalAmount, reservation.totalCurrency, locale)}
        </p>
      </header>

      {disruptions.map((offer) => {
        // The deadline in the agency's time, as E-Options words it.
        const deadline = offer.offerDeadline
          ? plainSpaces(
              format.dateTime(new Date(offer.offerDeadline), {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: OPS_TIME_ZONE,
                timeZoneName: 'short',
              }),
            )
          : '';
        const chosenKey = offer.effectiveChoice?.key ?? null;
        return (
          <section
            key={offer.id}
            id="disruption-options"
            aria-labelledby={`disruption-${offer.id}`}
            className="flex scroll-mt-24 flex-col gap-4 rounded-lg border border-warning-500 bg-surface p-6"
          >
            <div className="flex flex-col gap-1">
              <p className="text-overline uppercase text-warning-700">
                {tdo('overline', { reference: offer.reference })}
              </p>
              <h2 id={`disruption-${offer.id}`} className="text-h4 text-default">
                {offer.title}
              </h2>
              <p className="text-body text-secondary">{offer.summary}</p>
            </div>
            {offer.offerState === 'AWAITING' ? (
              <>
                <p className="text-body font-semibold">{tdo('choose', { deadline })}</p>
                <DisruptionChoice
                  offerId={offer.id}
                  options={offer.options}
                  defaultKey={offer.defaultOptionKey}
                />
                <p className="text-body-sm text-secondary">
                  {tdo('silence', { deadline, key: offer.defaultOptionKey ?? '' })}
                </p>
              </>
            ) : (
              <>
                <Alert variant={offer.offerState === 'DEFAULTED' ? 'warning' : 'success'}>
                  {offer.offerState === 'DEFAULTED'
                    ? tdo('defaulted', { key: chosenKey ?? '' })
                    : offer.choiceSource === 'TRAVELER'
                      ? tdo('chosen', { key: chosenKey ?? '' })
                      : tdo('desk', { key: chosenKey ?? '' })}
                </Alert>
                <ul className="flex flex-col gap-2">
                  {offer.options.map((option) => (
                    <li
                      key={option.key}
                      className={
                        option.key === chosenKey
                          ? 'rounded-md border border-primary-600 bg-primary-50 p-3'
                          : 'rounded-md border p-3 text-secondary'
                      }
                    >
                      <p className="font-semibold">
                        <span className="font-mono">{option.key}</span> · {option.title}
                      </p>
                      <p className="text-body-sm">{option.detail}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="text-body-sm text-secondary">
              {tdo('policy', { policy: offer.policy })}
            </p>
          </section>
        );
      })}

      <section className={card} aria-label={t('progressLabel')}>
        <TripProgress status={reservation.status} />
      </section>

      {CONFIRMING.includes(reservation.status) && reservation.providers.services > 0 ? (
        <ProviderProgress progress={reservation.providers} />
      ) : null}

      {confirmed ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success-200 bg-success-100 p-4">
          <p className="flex items-center gap-2 text-body font-semibold text-success-700">
            <Icon name="check-circle" className="h-5 w-5" />
            {t('confirmed')}
          </p>
          <Link
            href={`/account/reservations/${reservation.id}/confirmation`}
            className={buttonClassName({ variant: 'secondary', size: 'sm' })}
          >
            {t('viewConfirmation')}
          </Link>
        </section>
      ) : null}

      {ofac && ofacRequired ? (
        <section aria-labelledby="ofac-title" className={card}>
          <h2 id="ofac-title" className="text-h4 text-default">
            {t('ofac.title')}
          </h2>
          <OfacCertification reservationId={reservation.id} ofac={ofac} />
        </section>
      ) : null}

      {schedule ? (
        <PaymentSchedule
          reservationId={reservation.id}
          status={reservation.status}
          schedule={schedule}
          locked={ofacLocked}
        />
      ) : null}

      <section aria-labelledby="itinerary-title" className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="itinerary-title" className="text-h4 text-default">
            {t('itinerary')}
          </h2>
          <p className="text-body-sm text-muted">
            {t('serviceCount', { count: reservation.serviceItems.length })}
          </p>
        </div>
        {reservation.serviceItems.length === 0 ? (
          <Alert>{t('itineraryAssembling')}</Alert>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.type')}</TableHead>
                  <TableHead>{t('columns.status')}</TableHead>
                  <TableHead>{t('columns.province')}</TableHead>
                  <TableHead>{t('columns.starts')}</TableHead>
                  <TableHead>{t('columns.ends')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservation.serviceItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{tst(item.serviceType)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{tsi(item.status)}</Badge>
                    </TableCell>
                    <TableCell>{item.province ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {when(item.serviceDateStart)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {when(item.serviceDateEnd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section id="documents" aria-labelledby="documents-title" className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="documents-title" className="text-h4 text-default">
            {t('documents')}
          </h2>
          <p className="text-body-sm text-muted">
            {t('documentCount', { count: reservation.documents.length })}
          </p>
        </div>
        {reservation.documents.length === 0 ? (
          <Alert>{t('documentsEmpty')}</Alert>
        ) : (
          <ul className="flex flex-col gap-2 text-body-sm">
            {reservation.documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center gap-3">
                <Badge variant="outline">{td(document.type)}</Badge>
                <a
                  className="font-semibold text-primary-600 underline underline-offset-[3px]"
                  href={`/api/ota/documents/${document.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('download')}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {reservation.status === 'COMPLETED' ? (
        <section aria-labelledby="review-title" className={card}>
          <h2 id="review-title" className="text-h4 text-default">
            {trv('title')}
          </h2>
          <ReviewForm reservationId={reservation.id} review={reservation.review} />
        </section>
      ) : null}

      <div id="messages" className="scroll-mt-24">
        <MessageThread reservationId={reservation.id} />
      </div>
    </AccountShell>
  );
}

import { DEFAULT_LOCALE } from '@ota/i18n';
import type { MyReservationDetailDto, ReservationOfacDto } from '@ota/schemas';
import {
  Alert,
  Badge,
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
import { OfacCertification } from '@/components/account/ofac-certification';
import { TripProgress } from '@/components/account/trip-progress';
import { CheckoutButton } from '@/components/checkout-button';
import { MessageThread } from '@/components/message-thread';
import { ReviewForm } from '@/components/review-form';
import { TravelerStatusBadge } from '@/components/traveler-status-badge';
import { Link } from '@/i18n/navigation';
import { apiFetch, getServerSession } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { getTenantConfig } from '@/lib/tenant';

/**
 * One trip in the Account frame: its progress in the traveler's words, the US
 * travel-category certification when a traveler needs it (M3), the payment
 * step when it is due (locked until every US traveler has certified), the
 * itinerary, the documents, the review once completed, and the thread with
 * operations (`#messages`).
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

  const [t, tc, trv, tsi, tst, td, format, locale] = await Promise.all([
    getTranslations('account'),
    getTranslations('checkout'),
    getTranslations('review'),
    getTranslations('status.serviceItem'),
    getTranslations('status.serviceType'),
    getTranslations('status.document'),
    getFormatter(),
    getLocale(),
  ]);
  const tenant = getTenantConfig();
  const ofac = await apiFetch<ReservationOfacDto>(
    `/me/reservations/${id}/ofac?locale=${locale}`,
  ).catch(() => null);
  const ofacRequired = ofac?.travelers.some((traveler) => traveler.required) ?? false;
  const ofacLocked = (ofac?.missing ?? 0) > 0;
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

      <section className={card} aria-label={t('progressLabel')}>
        <TripProgress status={reservation.status} />
      </section>

      {ofac && ofacRequired ? (
        <section aria-labelledby="ofac-title" className={card}>
          <h2 id="ofac-title" className="text-h4 text-default">
            {t('ofac.title')}
          </h2>
          <OfacCertification reservationId={reservation.id} ofac={ofac} />
        </section>
      ) : null}

      {reservation.status === 'SECURED_AND_INVOICED' ||
      reservation.status === 'PENDING_PAYMENT' ? (
        <section
          aria-labelledby="pay-title"
          className="flex flex-col items-start gap-3 rounded-lg border border-accent-500 bg-accent-50 p-6"
        >
          <h2 id="pay-title" className="text-h4 text-default">
            {tc('title')}
          </h2>
          <p className="text-body-sm text-secondary">{tc('description')}</p>
          {ofacLocked ? (
            <Alert variant="warning">{t('ofac.locked')}</Alert>
          ) : (
            <CheckoutButton reservationId={reservation.id} />
          )}
        </section>
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

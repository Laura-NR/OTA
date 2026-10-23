import type { ConsentRecordDto, CustomerDetailDto, CustomerTripDto } from '@ota/schemas';
import { Badge, buttonClassName } from '@ota/ui';
import type { BadgeVariant } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getThresholds } from '@/lib/operating';
import { CertificationReminderButton } from '@/components/certification-reminder-button';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { bookingDates, money, opsDate } from '@/lib/ops-format';

const RETENTION_VARIANT: Record<CustomerDetailDto['retentionStatus'], BadgeVariant> = {
  ACTIVE: 'success',
  NOTICE_DUE: 'info',
  GRACE_PERIOD: 'warning',
  PURGE_DUE: 'destructive',
  ANONYMIZED: 'secondary',
};

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function ofacVariant(trip: CustomerTripDto): BadgeVariant {
  return trip.ofacMissing > 0 ? 'warning' : 'success';
}

/**
 * A-Customers profile: the account's identity, its trips with their OFAC
 * position, the consent log and the GDPR retention state (M3). Preferences,
 * documents and the communication history wait for their models.
 */
export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations('backoffice.customers');
  const thresholds = await getThresholds();
  const retentionCopy = {
    months: thresholds.retentionTriggerMonths,
    days: thresholds.retentionGraceDays,
  };
  const locale = await getLocale();

  const customer = await apiFetch<CustomerDetailDto>(`/customers/${id}`).catch(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }
      throw error;
    },
  );

  const consents = await apiFetch<ConsentRecordDto[]>(`/customers/${id}/consents`).catch(
    () => [],
  );
  const name = customer.fullName ?? customer.email;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/customers" className="text-body-sm text-muted hover:text-default">
          {t('back')}
        </Link>
        <div className="flex flex-wrap items-start gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-600 text-body font-semibold text-on-primary"
          >
            {initials(customer.fullName, customer.email)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="font-display text-h3">{name}</h1>
            <p className="text-caption text-muted">
              {customer.email}
              {customer.phone ? ` · ${customer.phone}` : ''}
              {customer.nationality ? ` · ${customer.nationality}` : ''} ·{' '}
              {t('since', { date: opsDate(customer.createdAt, locale) })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`mailto:${customer.email}`}
              className={buttonClassName({ variant: 'secondary', size: 'sm' })}
            >
              {t('message')}
            </a>
            {customer.phone ? (
              <a
                href={`tel:${customer.phone.replace(/[^+\d]/g, '')}`}
                className={buttonClassName({ variant: 'secondary', size: 'sm' })}
              >
                {t('call')}
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <section className="flex min-w-0 flex-col gap-3 rounded-lg border bg-surface px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-h4">{t('tripsTitle')}</h2>
          <p className="text-caption text-muted">
            {t('tripsDescription', { count: customer.trips.length })}
          </p>
        </div>
        {customer.trips.length === 0 ? (
          <p className="text-body-sm text-muted">{t('noTrips')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-body-sm">
              <thead>
                <tr className="text-left text-caption uppercase text-muted">
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    {t('table.code')}
                  </th>
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    {t('table.packageDates')}
                  </th>
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    {t('table.status')}
                  </th>
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    {t('ofacColumn')}
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    {t('table.total')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {customer.trips.map((trip) => (
                  <tr key={trip.id} className="border-t">
                    <td className="py-2 pr-4 align-top">
                      <Link
                        href={`/bookings/${trip.id}`}
                        className="font-mono text-primary-600 underline-offset-4 hover:underline"
                      >
                        {trip.bookingCode}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 align-top">
                      <div className="flex flex-col">
                        <span>{trip.packageName ?? t('customItinerary')}</span>
                        <span className="text-caption text-muted">
                          {bookingDates(trip.startDate, trip.endDate, locale)}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-4 align-top">
                      <StatusBadge status={trip.status} />
                    </td>
                    <td className="py-2 pr-4 align-top">
                      {trip.ofacRequired === 0 ? (
                        <span className="text-muted">{t('ofacStatus.none')}</span>
                      ) : (
                        <div className="flex flex-col items-start gap-1.5">
                          <Badge variant={ofacVariant(trip)}>
                            {trip.ofacMissing > 0
                              ? t('ofacStatus.missing', { count: trip.ofacMissing })
                              : t('ofacStatus.certified')}
                          </Badge>
                          {trip.ofacMissing > 0 ? (
                            <CertificationReminderButton
                              customerId={customer.id}
                              reservationId={trip.id}
                            />
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-right align-top font-mono">
                      {money(Number(trip.totalAmount), trip.totalCurrency, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex min-w-0 flex-col gap-3 rounded-lg border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-h4">{t('retentionTitle')}</h2>
          <Badge variant={RETENTION_VARIANT[customer.retentionStatus]}>
            {t(`retentionStatus.${customer.retentionStatus}`)}
          </Badge>
        </div>
        <p className="text-body-sm text-secondary">
          {t(`retentionDetail.${customer.retentionStatus}`, retentionCopy)}
        </p>
        <dl className="grid grid-cols-2 gap-4 text-body-sm">
          <div>
            <dt className="text-caption uppercase text-muted">{t('lastCompleted')}</dt>
            <dd className="mt-1">
              {customer.latestCompletedAt
                ? opsDate(customer.latestCompletedAt, locale)
                : t('noCompleted')}
            </dd>
          </div>
        </dl>
        <p className="text-caption text-muted">{t('retentionNote', retentionCopy)}</p>
      </section>

      <section className="flex min-w-0 flex-col gap-3 rounded-lg border bg-surface px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-h4">{t('consentTitle')}</h2>
          <p className="text-caption text-muted">{t('consentDescription')}</p>
        </div>
        {consents.length === 0 ? (
          <p className="text-body-sm text-muted">{t('consentNone')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-body-sm">
              <thead>
                <tr className="text-left text-caption uppercase text-muted">
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    {t('consentTable.purpose')}
                  </th>
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    {t('consentTable.state')}
                  </th>
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    {t('consentTable.version')}
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    {t('consentTable.when')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {consents.map((consent) => (
                  <tr key={consent.id} className="border-t">
                    <td className="py-2 pr-4 align-top">
                      {t(`consentPurposes.${consent.purpose}`)}
                    </td>
                    <td className="py-2 pr-4 align-top">
                      <Badge variant={consent.granted ? 'success' : 'secondary'}>
                        {consent.granted ? t('consentGranted') : t('consentWithdrawn')}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 align-top font-mono text-caption">
                      {consent.textVersion}
                    </td>
                    <td className="py-2 align-top text-caption text-muted">
                      {opsDate(consent.createdAt, locale)} ·{' '}
                      {t(`consentSources.${consent.source}`)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="rounded-lg border bg-surface px-5 py-3 text-caption text-muted">
        {t('later')}
      </p>
    </div>
  );
}

import { bookingMix, monthRange, relativeChange, UserRole } from '@ota/domain';
import type {
  AnalyticsOverviewDto,
  DispatchBoardRowDto,
  ReservationListItemDto,
  RetentionPendingUserDto,
  SupplierDto,
} from '@ota/schemas';
import { Alert, Badge, buttonClassName, cn, Icon, Tag } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { StartDispatchButton } from '@/components/dispatch-controls';
import { BarList } from '@/components/bar-list';
import { KpiCard } from '@/components/kpi-card';
import { OpsClock } from '@/components/ops-clock';
import { OpsDesk } from '@/components/ops-desk';
import { apiFetch, getServerSession } from '@/lib/api';
import { bookingDates, money, monthName, percent, signedPercent } from '@/lib/ops-format';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

/**
 * The payment rails in A-Dashboard's order. They are drawn as one-hue bars
 * named by their labels: the board's three rail colours fail a categorical
 * palette check (the teal is too low in chroma), so colour carries no identity.
 */
const RAILS = ['OPEN_BANKING_SEPA', 'CARD', 'OTHER'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function rangeQuery(range: { from: Date; to: Date }): string {
  return `?from=${range.from.toISOString()}&to=${range.to.toISOString()}`;
}

/**
 * The operations dashboard (A-Dashboard): this month's figures, the bookings
 * waiting on workers by age, the alerts, the live dispatch matrix and the
 * desk's tasks. It merges the pre-redesign escalation and dispatch pages; the
 * pipeline's status counts feed the Bookings figure.
 */
export default async function DashboardPage() {
  const t = await getTranslations('backoffice.dashboard');
  const locale = await getLocale();
  const session = await getServerSession();
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;

  const now = new Date();
  const month = monthRange(now);
  const previousMonth = monthRange(now, -1);

  const [rows, overview, previous, expiring, retention, submitted] = await Promise.all([
    apiFetch<DispatchBoardRowDto[]>('/dispatch/active').catch(() => null),
    apiFetch<AnalyticsOverviewDto>(`/analytics/overview${rangeQuery(month)}`).catch(
      () => null,
    ),
    apiFetch<AnalyticsOverviewDto>(
      `/analytics/overview${rangeQuery(previousMonth)}`,
    ).catch(() => null),
    apiFetch<SupplierDto[]>('/suppliers/expiring?days=30').catch(() => []),
    apiFetch<RetentionPendingUserDto[]>('/retention/pending').catch(() => []),
    apiFetch<ReservationListItemDto[]>(
      '/reservations?status=ITINERARY_SUBMITTED&limit=200',
    ).catch(() => []),
  ]);

  const mix = overview ? bookingMix(overview.operations.funnel) : null;
  const previousMix = previous ? bookingMix(previous.operations.funnel) : null;
  const change =
    mix && previousMix ? relativeChange(mix.confirmed, previousMix.confirmed) : null;
  const finance = overview?.finance;
  const railAmount = (rail: string) =>
    finance?.byRail.find((entry) => entry.rail === rail)?.amount ?? 0;

  const soonestExpiry = expiring
    .map((supplier) => supplier.credentialExpiresAt)
    .filter((value): value is string => value !== null)
    .map((value) => new Date(value).getTime())
    .sort((a, b) => a - b)[0];

  const toDispatch = submitted.filter((reservation) => reservation.serviceItemCount > 0);
  const purging = retention
    .filter((user) => user.status === 'GRACE_PERIOD' || user.status === 'PURGE_DUE')
    .map((user) => user.purgeAt)
    .filter((value): value is string => value !== null)
    .sort();
  const taskCount = toDispatch.length + expiring.length + (purging.length > 0 ? 1 : 0);

  const figures = (
    <>
      <KpiCard
        overline={t('kpi.bookings', {
          month: monthName(month.year, month.month, locale),
        })}
      >
        {mix ? (
          <>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="font-display text-h2">{mix.confirmed}</span>
              {change !== null ? (
                <Badge variant={change >= 0 ? 'success' : 'secondary'}>
                  {t('kpi.vsPrevious', {
                    change: signedPercent(change, locale),
                    month: monthName(
                      previousMonth.year,
                      previousMonth.month,
                      locale,
                      true,
                    ),
                  })}
                </Badge>
              ) : null}
            </div>
            <p className="text-body-sm text-secondary">
              {t.rich('kpi.mix', {
                pipeline: mix.pipeline,
                cancelled: mix.cancelled,
                strong: (chunks) => <strong className="text-default">{chunks}</strong>,
              })}
            </p>
          </>
        ) : (
          <p className="text-body-sm text-muted">{t('kpi.unavailable')}</p>
        )}
      </KpiCard>

      <KpiCard overline={t('kpi.revenue')}>
        {finance ? (
          <>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="font-mono text-h1-compact">
                {money(finance.gbv, 'EUR', locale)}
              </span>
              <span className="text-caption text-muted">
                {t('kpi.revenueNote', {
                  net: money(finance.netRevenue, 'EUR', locale),
                  rate: percent(finance.takeRate, locale),
                })}
              </span>
            </div>
            <BarList
              label={t('kpi.byRail')}
              items={RAILS.map((rail) => ({
                key: rail,
                label: t(`kpi.rails.${rail}`),
                value: railAmount(rail),
                display: money(railAmount(rail), 'EUR', locale),
              }))}
            />
          </>
        ) : (
          <p className="text-body-sm text-muted">{t('kpi.unavailable')}</p>
        )}
      </KpiCard>
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-h3">{t('title')}</h1>
        <OpsClock serverNow={now.getTime()} />
        {canManage ? (
          <Link href="/bookings/new" className={cn(buttonClassName(), 'ml-auto')}>
            <Icon name="plus" />
            {t('manualBooking')}
          </Link>
        ) : null}
      </div>

      {rows === null ? <Alert variant="destructive">{t('loadError')}</Alert> : null}

      <OpsDesk
        initialRows={rows ?? []}
        serverNow={now.getTime()}
        figures={figures}
        credentials={{
          count: expiring.length,
          soonestDays:
            soonestExpiry === undefined
              ? null
              : Math.max(0, Math.ceil((soonestExpiry - now.getTime()) / DAY_MS)),
        }}
        canManage={canManage}
      />

      <section aria-labelledby="tasks-title" className="rounded-lg border bg-surface">
        <div className="flex flex-wrap items-center gap-3 px-5 pb-3 pt-4">
          <h2 id="tasks-title" className="font-display text-h2-compact">
            {t('tasks.title')}
          </h2>
          <Tag>{t('tasks.open', { count: taskCount })}</Tag>
        </div>
        {taskCount === 0 ? (
          <p className="px-5 pb-5 text-body-sm text-muted">{t('tasks.empty')}</p>
        ) : (
          <ul className="divide-y border-t">
            {toDispatch.map((reservation) => (
              <li
                key={reservation.id}
                className="flex flex-wrap items-start gap-3 px-5 py-4"
              >
                <div className="min-w-64 flex-1">
                  <p className="font-semibold">
                    {t('tasks.dispatch.title', { code: reservation.bookingCode })}
                  </p>
                  <p className="text-body-sm text-secondary">
                    {t('tasks.dispatch.body', {
                      traveler: reservation.travelerName || reservation.travelerEmail,
                      dates: bookingDates(
                        reservation.startDate,
                        reservation.endDate,
                        locale,
                      ),
                      count: reservation.serviceItemCount,
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <StartDispatchButton
                    reservationId={reservation.id}
                    canManage={canManage}
                  />
                  <Link
                    href={`/bookings/${reservation.id}`}
                    className={buttonClassName({ variant: 'tertiary', size: 'md' })}
                  >
                    {t('matrix.open')}
                  </Link>
                </div>
              </li>
            ))}
            {expiring.map((supplier) => (
              <li
                key={supplier.id}
                className="flex flex-wrap items-start gap-3 px-5 py-4"
              >
                <div className="min-w-64 flex-1">
                  <p className="font-semibold">
                    {t('tasks.credential.title', {
                      name: supplier.fullName ?? supplier.email,
                      date: supplier.credentialExpiresAt
                        ? new Date(supplier.credentialExpiresAt).toLocaleDateString(
                            locale,
                          )
                        : '—',
                    })}
                  </p>
                  <p className="text-body-sm text-secondary">
                    {t('tasks.credential.body')}
                  </p>
                </div>
                <Link
                  href={`/suppliers/${supplier.id}`}
                  className={buttonClassName({ variant: 'secondary', size: 'md' })}
                >
                  {t('tasks.credential.action')}
                </Link>
              </li>
            ))}
            {purging.length > 0 ? (
              <li className="flex flex-wrap items-start gap-3 px-5 py-4">
                <div className="min-w-64 flex-1">
                  <p className="font-semibold">
                    {t('tasks.retention.title', {
                      count: purging.length,
                      date: new Date(purging[0]!).toLocaleDateString(locale),
                    })}
                  </p>
                  <p className="text-body-sm text-secondary">
                    {t('tasks.retention.body')}
                  </p>
                </div>
                <Link
                  href="/customers/retention"
                  className={buttonClassName({ variant: 'secondary', size: 'md' })}
                >
                  {t('tasks.retention.action')}
                </Link>
              </li>
            ) : null}
          </ul>
        )}
      </section>
    </div>
  );
}

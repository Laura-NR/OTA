import {
  RESERVATION_STATUSES,
  TRAVEL_WINDOWS,
  UserRole,
  bookingMix,
  compareUrgency,
  inTravelWindow,
  isArrivingWithin,
  paymentAlert,
  serviceItemAlert,
  travelerStatus,
  type EscalationAlert,
  type ReservationStatus,
} from '@ota/domain';
import type { DispatchBoardRowDto, ReservationListItemDto } from '@ota/schemas';
import {
  Alert,
  buttonClassName,
  cn,
  EmptyState,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { BookingFilters } from '@/components/booking-filters';
import { StatusBadge } from '@/components/status-badge';
import { WhoActsLegend } from '@/components/who-acts-legend';
import { apiFetch, getServerSession } from '@/lib/api';
import { bookingDates, countdown, money, opsTime } from '@/lib/ops-format';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

/** A-Bookings' saved views that today's data can answer. */
const VIEWS = ['all', 'attention', 'arriving', 'ofac', 'payment'] as const;
type View = (typeof VIEWS)[number];

const PAGE_SIZE = 25;
/** The list reads the most recent bookings the API returns in one page. */
const FETCH_LIMIT = 200;

interface Params {
  view?: string;
  state?: string;
  window?: string;
  province?: string;
  page?: string;
}

interface Row extends ReservationListItemDto {
  alert: EscalationAlert;
  /** The soonest deadline of an open offer, while the booking is in dispatch. */
  deadline: Date | null;
}

const ALERTS: readonly EscalationAlert[] = ['RED', 'AMBER'];

function worstAlert(board: DispatchBoardRowDto | undefined, now: Date): EscalationAlert {
  const alerts =
    board?.serviceItems.map((item) =>
      serviceItemAlert({
        status: item.status,
        offeredAt: item.offeredAt ? new Date(item.offeredAt) : null,
        deadline: item.deadline ? new Date(item.deadline) : null,
        now,
      }),
    ) ?? [];
  return (
    alerts.find((alert) => alert === 'RED') ?? alerts.find((a) => a === 'AMBER') ?? 'NONE'
  );
}

function soonestDeadline(board: DispatchBoardRowDto | undefined): Date | null {
  const deadlines =
    board?.serviceItems
      .filter((item) => item.status === 'OFFERED' && item.deadline)
      .map((item) => new Date(item.deadline!).getTime()) ?? [];
  return deadlines.length > 0 ? new Date(Math.min(...deadlines)) : null;
}

function inView(row: Row, view: View, now: Date): boolean {
  if (view === 'attention') return ALERTS.includes(row.alert);
  if (view === 'arriving')
    return isArrivingWithin(new Date(row.startDate), row.status, now);
  if (view === 'ofac')
    return (
      row.ofacMissing > 0 && row.status !== 'COMPLETED' && row.status !== 'CANCELLED'
    );
  if (view === 'payment')
    // M4: a first payment past its window, or a balance past due.
    return (
      paymentAlert(
        row.nextInstalment
          ? { kind: row.nextInstalment.kind, dueAt: new Date(row.nextInstalment.dueAt) }
          : null,
        row.status,
        now,
      ) !== null
    );
  return true;
}

/** `/bookings` with `params` changed; a filter change goes back to page one. */
function hrefWith(params: Params, changes: Partial<Params>): string {
  const next = new URLSearchParams();
  const merged: Params = { ...params, page: undefined, ...changes };
  for (const [key, value] of Object.entries(merged)) {
    if (value && !(key === 'view' && value === 'all')) next.set(key, value);
  }
  const query = next.toString();
  return query ? `/bookings?${query}` : '/bookings';
}

/**
 * The bookings list (A-Bookings): saved views, the state machine as filter
 * chips with counts, travel-date and province filters, and the most urgent
 * bookings first. The legend says who acts in each state.
 */
export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const t = await getTranslations('backoffice.bookings');
  const traveler = await getTranslations('status.traveler');
  const locale = await getLocale();
  const session = await getServerSession();
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;

  const view: View = VIEWS.find((candidate) => candidate === params.view) ?? 'all';
  const state = RESERVATION_STATUSES.find((candidate) => candidate === params.state);
  const travelWindow = TRAVEL_WINDOWS.find((candidate) => candidate === params.window);
  const province = params.province || undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const [list, board] = await Promise.all([
    apiFetch<ReservationListItemDto[]>(`/reservations?limit=${FETCH_LIMIT}`).then(
      (reservations) => ({ reservations, error: null }),
      (error: unknown) => ({
        reservations: [] as ReservationListItemDto[],
        error: error instanceof Error ? error.message : t('loadError'),
      }),
    ),
    apiFetch<DispatchBoardRowDto[]>('/dispatch/active').catch(() => []),
  ]);
  const { reservations, error: loadError } = list;

  const now = new Date();
  const boardById = new Map(board.map((row) => [row.reservationId, row]));
  const rows: Row[] = reservations.map((reservation) => {
    const live = boardById.get(reservation.id);
    return {
      ...reservation,
      alert: worstAlert(live, now),
      deadline: soonestDeadline(live),
    };
  });

  const filtered = rows.filter(
    (row) =>
      (!travelWindow ||
        inTravelWindow(
          { startDate: new Date(row.startDate), endDate: new Date(row.endDate) },
          travelWindow,
          now,
        )) &&
      (!province || row.provinces.includes(province)),
  );
  const viewCounts = Object.fromEntries(
    VIEWS.map((candidate) => [
      candidate,
      filtered.filter((row) => inView(row, candidate, now)).length,
    ]),
  ) as Record<View, number>;
  const viewed = filtered.filter((row) => inView(row, view, now));
  const stateCounts = new Map<ReservationStatus, number>(
    RESERVATION_STATUSES.map((status) => [
      status,
      viewed.filter((row) => row.status === status).length,
    ]),
  );
  const shown = viewed
    .filter((row) => !state || row.status === state)
    .sort((a, b) =>
      compareUrgency(
        { alert: a.alert, deadline: a.deadline, startDate: new Date(a.startDate) },
        { alert: b.alert, deadline: b.deadline, startDate: new Date(b.startDate) },
      ),
    );
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const paged = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const mix = bookingMix(
    RESERVATION_STATUSES.map((status) => ({
      status,
      count: rows.filter((row) => row.status === status).length,
    })),
  );
  const provinces = [...new Set(rows.flatMap((row) => row.provinces))].sort((a, b) =>
    a.localeCompare(b, locale),
  );
  const filtering = Boolean(state || travelWindow || province);

  function clock(row: Row) {
    const tone =
      row.alert === 'RED'
        ? 'text-error-700'
        : row.alert === 'AMBER'
          ? 'text-warning-700'
          : '';
    if (row.deadline) {
      const left = row.deadline.getTime() - now.getTime();
      return (
        <strong className={cn('font-mono', tone)}>
          {left > 0 ? t('table.left', { time: countdown(left) }) : t('table.expired')}
        </strong>
      );
    }
    if (row.alert === 'RED') {
      return <strong className={cn('font-mono', tone)}>{t('table.expired')}</strong>;
    }
    return <span className="text-muted">—</span>;
  }

  const dispatch = (row: Row) =>
    row.serviceItemCount > 0
      ? t('table.dispatchOf', {
          accepted: row.serviceItemsAccepted,
          total: row.serviceItemCount,
        })
      : '—';

  const tone = (row: Row) =>
    row.alert === 'RED' ? 'destructive' : row.alert === 'AMBER' ? 'attention' : undefined;

  const openLink = (row: Row) => (
    <Link
      href={`/bookings/${row.id}`}
      aria-label={t('table.openLabel', { code: row.bookingCode })}
      className={buttonClassName({ variant: 'secondary', size: 'sm' })}
    >
      {t('table.open')}
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-h3">{t('title')}</h1>
          <p className="text-caption text-muted">
            {t('summary', {
              total: rows.length,
              pipeline: mix.pipeline,
              time: opsTime(now, locale),
            })}
          </p>
        </div>
        {canManage ? (
          <Link href="/bookings/new" className={cn(buttonClassName(), 'ml-auto')}>
            <Icon name="plus" />
            {t('manualBooking')}
          </Link>
        ) : null}
      </div>

      {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}

      <div className="flex min-w-0 flex-col gap-6">
        <nav aria-label={t('views.label')} className="flex min-w-0 flex-col gap-2">
          <p className="text-overline uppercase text-primary-600">{t('views.label')}</p>
          <ul className="flex flex-wrap gap-2">
            {VIEWS.map((candidate) => {
              const active = candidate === view;
              return (
                <li key={candidate}>
                  <Link
                    href={hrefWith(params, { view: candidate, state: undefined })}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-10 items-center justify-between gap-3 rounded-md border px-3 text-body-sm font-medium',
                      active
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'bg-surface text-secondary hover:bg-neutral-100',
                    )}
                  >
                    {t(`views.${candidate}`)}
                    <span className="font-mono text-caption">
                      {viewCounts[candidate]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-labelledby="states-title"
            className="flex flex-col gap-4 rounded-lg border bg-surface px-5 py-4"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id="states-title" className="text-overline uppercase text-primary-600">
                {t('states.title')}
              </h2>
              <p className="text-caption text-muted">{t('states.hint')}</p>
              {filtering ? (
                <Link
                  href={hrefWith(
                    { view: params.view },
                    { state: undefined, window: undefined, province: undefined },
                  )}
                  className="ml-auto text-body-sm font-medium text-primary-600 underline-offset-4 hover:underline"
                >
                  {t('filters.clear')}
                </Link>
              ) : null}
            </div>
            <ul className="flex flex-wrap gap-2">
              {RESERVATION_STATUSES.map((status) => {
                const active = status === state;
                return (
                  <li key={status}>
                    <Link
                      href={hrefWith(params, { state: active ? undefined : status })}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'inline-flex h-8 items-center gap-2 rounded-full border px-3 font-mono text-caption',
                        active
                          ? 'border-primary-600 bg-primary-600 text-on-primary'
                          : 'bg-surface text-secondary hover:bg-neutral-100',
                      )}
                    >
                      {status}
                      <span className="font-semibold">{stateCounts.get(status)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <BookingFilters provinces={provinces} />
          </section>

          <section aria-labelledby="list-title" className="rounded-lg border bg-surface">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
              <h2 id="list-title" className="font-display text-h2-compact">
                {state ?? t(`views.${view}`)}
              </h2>
              <p className="text-caption text-muted">
                {t('table.showing', { shown: paged.length, total: shown.length })}
              </p>
            </div>

            {paged.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState
                  title={t('empty.title')}
                  description={t('empty.hint')}
                  action={
                    filtering || view !== 'all' ? (
                      <Link
                        href="/bookings"
                        className={buttonClassName({ variant: 'secondary' })}
                      >
                        {t('filters.clear')}
                      </Link>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">{t('table.clock')}</TableHead>
                        <TableHead scope="col">{t('table.code')}</TableHead>
                        <TableHead scope="col">{t('table.traveler')}</TableHead>
                        <TableHead scope="col">{t('table.packageDates')}</TableHead>
                        <TableHead scope="col">{t('table.state')}</TableHead>
                        <TableHead scope="col">{t('table.dispatch')}</TableHead>
                        <TableHead scope="col" className="text-right">
                          {t('table.totalPaid')}
                        </TableHead>
                        <TableHead scope="col">
                          <span className="sr-only">{t('table.open')}</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paged.map((row) => (
                        <TableRow key={row.id} tone={tone(row)}>
                          <TableCell className="whitespace-nowrap align-top">
                            {clock(row)}
                          </TableCell>
                          <TableCell className="align-top font-mono font-medium">
                            {row.bookingCode}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex min-w-0 flex-col">
                              <span>{row.travelerName || row.travelerEmail}</span>
                              {row.travelerName ? (
                                <span className="text-caption text-muted">
                                  {row.travelerEmail}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex flex-col">
                              <span>{row.packageName ?? t('table.custom')}</span>
                              <span className="text-caption text-muted">
                                {bookingDates(row.startDate, row.endDate, locale)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex flex-col items-start gap-1">
                              <StatusBadge status={row.status} />
                              <span className="text-caption text-muted">
                                {traveler(travelerStatus(row.status))}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap align-top">
                            {dispatch(row)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right align-top">
                            <div className="flex flex-col items-end">
                              <span className="font-mono">
                                {money(
                                  Number(row.totalAmount),
                                  row.totalCurrency,
                                  locale,
                                )}
                              </span>
                              <span className="text-caption text-muted">
                                {t('table.paidAmount', {
                                  amount: money(
                                    Number(row.paidAmount),
                                    row.totalCurrency,
                                    locale,
                                  ),
                                })}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">{openLink(row)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <ul className="flex flex-col divide-y border-t md:hidden">
                  {paged.map((row) => (
                    <li
                      key={row.id}
                      className={cn(
                        'flex flex-col gap-2 px-5 py-4',
                        row.alert === 'RED' && 'bg-error-100',
                        row.alert === 'AMBER' && 'bg-accent-50',
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-medium">{row.bookingCode}</span>
                        <StatusBadge status={row.status} />
                        <span className="ml-auto whitespace-nowrap">{clock(row)}</span>
                      </div>
                      <p>{row.travelerName || row.travelerEmail}</p>
                      <p className="text-caption text-muted">
                        {row.packageName ?? t('table.custom')} ·{' '}
                        {bookingDates(row.startDate, row.endDate, locale)}
                      </p>
                      <dl className="grid grid-cols-3 gap-2 text-caption">
                        <div>
                          <dt className="text-muted">{t('table.dispatch')}</dt>
                          <dd>{dispatch(row)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">{t('table.total')}</dt>
                          <dd className="font-mono">
                            {money(Number(row.totalAmount), row.totalCurrency, locale)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted">{t('table.paid')}</dt>
                          <dd className="font-mono">
                            {money(Number(row.paidAmount), row.totalCurrency, locale)}
                          </dd>
                        </div>
                      </dl>
                      <div>{openLink(row)}</div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {pages > 1 ? (
              <nav
                aria-label={t('pagination.label')}
                className="flex items-center justify-between gap-3 border-t px-5 py-3 text-body-sm"
              >
                {current > 1 ? (
                  <Link href={hrefWith(params, { page: String(current - 1) })}>
                    {t('pagination.previous')}
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-muted">
                  {t('pagination.page', { page: current, pages })}
                </span>
                {current < pages ? (
                  <Link href={hrefWith(params, { page: String(current + 1) })}>
                    {t('pagination.next')}
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </section>
        </div>
      </div>

      <WhoActsLegend />
    </div>
  );
}

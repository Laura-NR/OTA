'use client';

import {
  AGING_BUCKETS,
  pendingConfirmations,
  resolveDispatchTimeoutMs,
  type AgingBucketId,
  type EscalationAlert,
} from '@ota/domain';
import type {
  DeskAlertMuteStateDto,
  DispatchBoardItemDto,
  DispatchBoardRowDto,
} from '@ota/schemas';
import {
  Badge,
  Button,
  buttonClassName,
  cn,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useDeskTelemetry } from '@/components/telemetry/desk-telemetry';
import { timerCopy, type DeskClock } from '@/lib/desk-clock';
import { MATRIX_COLUMNS as COLUMNS } from '@/lib/matrix-columns';
import { bookingDates, countdown, hoursMinutes, opsTime } from '@/lib/ops-format';

import { AlertStrip } from './alert-strip';
import { useDeskAlerts } from './desk-alerts';
import { KpiCard } from './kpi-card';
import { RedispatchPanel, type RedispatchTarget } from './redispatch-panel';
import {
  itemAlert,
  OPEN_ITEM_STATUSES,
  ServiceItemStatusBadge,
  TIMER_FILL,
} from './service-item-status';

/**
 * The sticky row header's own fill, so it hides what scrolls beneath it; the
 * column is 11.5 rem wide and the scroll box keeps that much padding, so a
 * focused cell never scrolls under it (A-A11y 02, WCAG 2.4.11).
 */
const ROW_HEADER_FILL: Record<EscalationAlert, string> = {
  NONE: 'bg-surface',
  AMBER: 'bg-accent-50',
  RED: 'bg-error-100',
};

const BUCKET_BARS: Record<AgingBucketId, string> = {
  upTo2h: 'bg-primary-600',
  upTo6h: 'bg-primary-500',
  upTo24h: 'bg-warning-600',
  over24h: 'bg-error-600',
};

const BUCKET_TEXT: Record<AgingBucketId, string> = {
  upTo2h: '',
  upTo6h: '',
  upTo24h: 'text-warning-700',
  over24h: 'text-error-700',
};

function rowAlert(
  row: DispatchBoardRowDto,
  now: Date,
  amberThreshold: number,
): EscalationAlert {
  const alerts = row.serviceItems.map((item) => itemAlert(item, now, amberThreshold));
  if (alerts.includes('RED')) return 'RED';
  if (alerts.includes('AMBER')) return 'AMBER';
  return 'NONE';
}

export interface CredentialAlert {
  count: number;
  /** Days until the soonest expiry, when there is one. */
  soonestDays: number | null;
}

export interface OpsDeskProps {
  /** The board the page read, which refreshes the desk's; null if unread. */
  initialRows: DispatchBoardRowDto[] | null;
  /** The month's figures (bookings, revenue), rendered on the server. */
  figures: ReactNode;
  credentials: CredentialAlert;
  /** Open bookings with a US traveler still to certify (M3): payment and vouchers held. */
  ofacMissing: number;
  /** M4: first payments past their window, and balances past due. */
  payments: { windowExpired: number; balanceOverdue: number };
  /** M8: open cases' red Unknowns, calls due and parties needing help. */
  disruptions: { overdueUnknown: number; callNow: number; needsHelp: number };
  /** The M9 timers and amber share in force. */
  clock: DeskClock;
  /** The desk's "Mute 15 min" state at the request's time; null if unread. */
  initialMute: DeskAlertMuteStateDto | null;
  canManage: boolean;
}

/**
 * The live part of the operations dashboard (A-Dashboard, spec §4.3): the alert
 * strip, the pending and alert figures and the dispatch matrix. The board, its
 * clock, the cue, the announcements, acknowledgements and the mute are the
 * desk's (`DeskAlerts`, in the layout), so they carry on on every desk page;
 * this page draws them as the matrix, and `A` or a row's button acknowledges
 * that row's red alerts.
 */
export function OpsDesk({
  initialRows,
  figures,
  credentials,
  ofacMissing,
  payments,
  disruptions,
  clock,
  initialMute,
  canManage,
}: OpsDeskProps) {
  const t = useTranslations('backoffice.dashboard');
  const locale = useLocale();
  const alerts = useDeskAlerts();
  if (!alerts) {
    throw new Error('OpsDesk renders inside the desk shell (DeskAlerts).');
  }
  const { rows, now, connected, red, amber, isAcknowledged } = alerts;
  const nowMs = now.getTime();
  const [target, setTarget] = useState<RedispatchTarget | null>(null);
  const track = useDeskTelemetry();
  /** Whether this empty spell of the matrix was reported (T-Events). */
  const emptyReported = useRef(false);
  /** The booking whose re-dispatch went out, to take focus back if its button goes. */
  const restoreFocusTo = useRef<string | null>(null);

  useEffect(() => alerts.seed(initialRows, initialMute), [initialRows, initialMute]);

  useEffect(() => {
    const reservationId = restoreFocusTo.current;
    restoreFocusTo.current = null;
    if (!reservationId || document.activeElement !== document.body) {
      return;
    }
    // The offer went out and its button left the matrix with focus on it.
    const link = document.getElementById(`matrix-row-${reservationId}`);
    (link ?? document.getElementById('matrix-title'))?.focus();
  }, [rows]);

  useEffect(() => {
    if (rows.length > 0) {
      emptyReported.current = false;
    } else if (!emptyReported.current) {
      emptyReported.current = true;
      track('admin_state_shown', { kind: 'empty' });
    }
  }, [rows.length, track]);

  const pending = pendingConfirmations(
    rows.map((row) => ({
      waitingSince: new Date(row.waitingSince),
      itemStatuses: row.serviceItems.map((item) => item.status),
    })),
    now,
  );
  const tallest = Math.max(1, ...Object.values(pending.buckets));

  /** `A`, or the row's button: acknowledge the row's red alerts, with the undo. */
  function acknowledge(row: DispatchBoardRowDto) {
    if (document.activeElement?.hasAttribute('data-shortcut-acknowledge')) {
      // The button leaves the row once its alerts are acknowledged.
      document.getElementById(`matrix-row-${row.reservationId}`)?.focus();
    }
    alerts!.acknowledge(row);
  }

  function timerLabel(row: DispatchBoardRowDto): string {
    const window = resolveDispatchTimeoutMs({
      now: new Date(row.waitingSince),
      arrivalAt: new Date(row.startDate),
      timers: clock.timers,
    });
    const { hours, minutes } = hoursMinutes(window);
    return hours > 0 ? t('timerHours', { hours }) : t('timerMinutes', { minutes });
  }

  function openPanel(
    row: DispatchBoardRowDto,
    item: DispatchBoardItemDto,
    service: string,
  ) {
    setTarget({
      serviceItemId: item.id,
      reservationId: row.reservationId,
      title: [
        service,
        row.bookingCode,
        bookingDates(row.startDate, row.endDate, locale),
        item.province,
      ]
        .filter(Boolean)
        .join(' · '),
      timerLabel: timerLabel(row),
    });
  }

  function itemCell(
    row: DispatchBoardRowDto,
    item: DispatchBoardItemDto,
    service: string,
  ) {
    const alert = itemAlert(item, now, clock.amberThreshold);

    const reroute =
      canManage &&
      OPEN_ITEM_STATUSES.includes(item.status) &&
      (alert !== 'NONE' || item.status === 'UNASSIGNED');

    return (
      <div key={item.id} className="flex min-w-32 flex-col gap-1.5">
        <ServiceItemStatusBadge
          item={item}
          now={now}
          amberThreshold={clock.amberThreshold}
        />
        <span className="truncate text-caption text-secondary">
          {[item.supplierName ?? t('noWorker'), item.province]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {alert === 'RED' && isAcknowledged(item) ? (
          <span className="inline-flex items-center gap-1 text-caption text-secondary">
            <Icon name="check" className="h-3.5 w-3.5" />
            {item.acknowledgement
              ? t('acknowledge.done', {
                  name: item.acknowledgement.by ?? t('audio.someone'),
                  time: opsTime(item.acknowledgement.at, locale),
                })
              : t('acknowledge.pending')}
          </span>
        ) : null}
        {item.status === 'OFFERED' && item.workerPhone ? (
          <a
            href={`tel:${item.workerPhone}`}
            className="inline-flex items-center gap-1 self-start text-caption font-medium text-primary-600 underline-offset-4 hover:underline"
          >
            <Icon name="phone" className="h-3.5 w-3.5" />
            {item.workerPhone}
          </a>
        ) : null}
        {reroute ? (
          <Button
            size="sm"
            variant={alert === 'RED' ? 'destructive' : 'secondary'}
            className="self-start"
            aria-label={t('redispatchFor', { service, code: row.bookingCode })}
            data-shortcut-redispatch={alert === 'NONE' ? undefined : alert}
            onClick={() => openPanel(row, item, service)}
          >
            {t('redispatch')}
          </Button>
        ) : null}
      </div>
    );
  }

  function timerCell(row: DispatchBoardRowDto) {
    const accepted = row.serviceItems.filter(
      (item) => item.status === 'ACCEPTED' || item.status === 'FULFILLED',
    ).length;
    const total = row.serviceItems.length;
    const deadlines = row.serviceItems
      .filter((item) => item.status === 'OFFERED' && item.deadline)
      .map((item) => new Date(item.deadline!).getTime());
    const alert = rowAlert(row, now, clock.amberThreshold);
    const tone =
      alert === 'RED' ? 'text-error-700' : alert === 'AMBER' ? 'text-warning-700' : '';

    let headline: string;
    if (accepted === total && total > 0) {
      headline = t('allAccepted');
    } else if (deadlines.length > 0) {
      const left = Math.min(...deadlines) - nowMs;
      headline = left > 0 ? t('left', { time: countdown(left) }) : t('expired');
    } else {
      headline = t('expired');
    }

    return (
      <div className="flex min-w-28 flex-col items-start gap-1">
        <strong className={cn('font-mono', tone)}>{headline}</strong>
        <span className="text-caption text-muted">
          {row.status === 'ACTION_REQUIRED'
            ? t('acceptedOfAction', { accepted, total })
            : t('acceptedOf', { accepted, total })}
        </span>
        <div className="mt-1 flex flex-wrap gap-2">
          <Link
            href={`/bookings/${row.reservationId}`}
            aria-label={t('matrix.openBooking', { code: row.bookingCode })}
            className={buttonClassName({ variant: 'secondary', size: 'sm' })}
          >
            {t('matrix.open')}
          </Link>
          {canManage &&
          row.serviceItems.some(
            (item) =>
              itemAlert(item, now, clock.amberThreshold) === 'RED' &&
              !isAcknowledged(item),
          ) ? (
            <Button
              size="sm"
              variant="secondary"
              aria-label={t('acknowledge.label', { code: row.bookingCode })}
              data-shortcut-acknowledge=""
              onClick={() => acknowledge(row)}
            >
              {t('acknowledge.button')}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AlertStrip matrixHref="#matrix" />

      <section
        aria-label={t('kpi.label')}
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        {figures}

        <KpiCard overline={t('kpi.pending')}>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="font-display text-h2">{pending.total}</span>
            <span className="text-caption text-muted">{t('kpi.pendingNote')}</span>
          </div>
          <div aria-hidden="true" className="grid h-14 grid-cols-4 items-end gap-1.5">
            {AGING_BUCKETS.map((bucket) => (
              <div key={bucket.id} className="flex h-full flex-col justify-end">
                <span
                  className={cn('block rounded-t-sm', BUCKET_BARS[bucket.id])}
                  style={{ height: `${(pending.buckets[bucket.id] / tallest) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <ul
            aria-label={t('kpi.aging')}
            className="grid grid-cols-4 gap-1.5 text-center text-caption text-secondary"
          >
            {AGING_BUCKETS.map((bucket) => (
              <li key={bucket.id} className={BUCKET_TEXT[bucket.id]}>
                <strong>{pending.buckets[bucket.id]}</strong>
                <br />
                {t(`kpi.buckets.${bucket.id}`)}
              </li>
            ))}
          </ul>
        </KpiCard>

        <KpiCard overline={t('kpi.alerts')}>
          {red.length +
            amber.length +
            credentials.count +
            ofacMissing +
            payments.windowExpired +
            payments.balanceOverdue +
            disruptions.overdueUnknown +
            disruptions.callNow +
            disruptions.needsHelp ===
          0 ? (
            <p className="text-body-sm text-muted">{t('kpi.noAlerts')}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-body-sm">
              {red.length > 0 ? (
                <li>
                  <a href="#matrix" className="flex flex-wrap items-center gap-2">
                    <Badge variant="timeout">{t('kpi.red', { count: red.length })}</Badge>
                    {t('kpi.redNote')}
                  </a>
                </li>
              ) : null}
              {amber.length > 0 ? (
                <li>
                  <a href="#matrix" className="flex flex-wrap items-center gap-2">
                    <Badge variant="attention">
                      {t('kpi.amber', { count: amber.length })}
                    </Badge>
                    {t('kpi.amberNote', { amber: clock.amberPercent })}
                  </a>
                </li>
              ) : null}
              {disruptions.overdueUnknown > 0 ? (
                <li>
                  <Link href="/disruptions" className="flex flex-wrap items-center gap-2">
                    <Badge variant="timeout">
                      {t('kpi.disruptionUnknown', { count: disruptions.overdueUnknown })}
                    </Badge>
                    {t('kpi.disruptionNote')}
                  </Link>
                </li>
              ) : null}
              {disruptions.needsHelp > 0 ? (
                <li>
                  <Link href="/disruptions" className="flex flex-wrap items-center gap-2">
                    <Badge variant="destructive">
                      {t('kpi.disruptionHelp', { count: disruptions.needsHelp })}
                    </Badge>
                    {t('kpi.disruptionNote')}
                  </Link>
                </li>
              ) : null}
              {disruptions.callNow > 0 ? (
                <li>
                  <Link href="/disruptions" className="flex flex-wrap items-center gap-2">
                    <Badge variant="attention">
                      {t('kpi.disruptionCall', { count: disruptions.callNow })}
                    </Badge>
                    {t('kpi.disruptionNote')}
                  </Link>
                </li>
              ) : null}
              {ofacMissing > 0 ? (
                <li>
                  <Link
                    href="/bookings?view=ofac"
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Badge variant="warning">
                      {t('kpi.ofac', { count: ofacMissing })}
                    </Badge>
                    {t('kpi.ofacNote')}
                  </Link>
                </li>
              ) : null}
              {payments.windowExpired > 0 ? (
                <li>
                  <Link
                    href="/bookings?view=payment"
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Badge variant="warning">
                      {t('kpi.windowExpired', { count: payments.windowExpired })}
                    </Badge>
                    {t('kpi.windowExpiredNote')}
                  </Link>
                </li>
              ) : null}
              {payments.balanceOverdue > 0 ? (
                <li>
                  <Link
                    href="/bookings?view=payment"
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Badge variant="warning">
                      {t('kpi.balanceOverdue', { count: payments.balanceOverdue })}
                    </Badge>
                    {t('kpi.balanceOverdueNote')}
                  </Link>
                </li>
              ) : null}
              {credentials.count > 0 ? (
                <li>
                  <Link href="/suppliers" className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {t('kpi.credential', { count: credentials.count })}
                    </Badge>
                    {credentials.soonestDays === null
                      ? t('kpi.credentialNote', { days: clock.credentialDays })
                      : t('kpi.credentialDays', { days: credentials.soonestDays })}
                  </Link>
                </li>
              ) : null}
            </ul>
          )}
        </KpiCard>
      </section>

      <section
        id="matrix"
        aria-labelledby="matrix-title"
        className="scroll-mt-6 rounded-lg border bg-surface"
      >
        <div className="flex flex-wrap items-center gap-3 px-5 pb-3 pt-4">
          <div className="mr-auto flex flex-col gap-0.5">
            <h2 id="matrix-title" tabIndex={-1} className="font-display text-h2-compact">
              {t('matrix.title')}
            </h2>
            <p className="text-caption text-muted">{t('matrix.description')}</p>
          </div>
          <ul className="flex flex-wrap gap-3 text-caption text-secondary">
            {(['NONE', 'AMBER', 'RED'] as const).map((alert) => (
              <li key={alert} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn('h-1.5 w-6 rounded-full', TIMER_FILL[alert])}
                />
                {t(`matrix.legend.${alert}`, { amber: clock.amberPercent })}
              </li>
            ))}
          </ul>
          <span className="inline-flex items-center gap-1.5 text-caption text-secondary">
            <span
              aria-hidden="true"
              className={cn(
                'h-2 w-2 rounded-full',
                connected ? 'bg-success-600' : 'bg-error-600',
              )}
            />
            {connected ? t('matrix.live') : t('matrix.offline')}
          </span>
          <Link
            href="/bookings"
            className={buttonClassName({ variant: 'secondary', size: 'sm' })}
          >
            {t('matrix.allBookings')}
          </Link>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 pb-5 text-body-sm text-muted">{t('matrix.empty')}</p>
        ) : (
          <Table scrollClassName="scroll-ps-[11.5rem]">
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className="sticky left-0 z-10">
                  {t('matrix.booking')}
                </TableHead>
                <TableHead scope="col">{t('matrix.timer')}</TableHead>
                {COLUMNS.map((column) => (
                  <TableHead key={column.key} scope="col">
                    {t(`matrix.columns.${column.key}`)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const alert = rowAlert(row, now, clock.amberThreshold);
                return (
                  <TableRow
                    key={row.reservationId}
                    data-shortcut-row=""
                    tone={
                      alert === 'RED'
                        ? 'destructive'
                        : alert === 'AMBER'
                          ? 'attention'
                          : undefined
                    }
                  >
                    <TableHead
                      scope="row"
                      className={cn(
                        'sticky left-0 z-10 w-[11.5rem] min-w-[11.5rem] p-3 align-top font-normal text-default',
                        ROW_HEADER_FILL[alert],
                      )}
                    >
                      <div className="flex flex-col gap-1">
                        <Link
                          id={`matrix-row-${row.reservationId}`}
                          href={`/bookings/${row.reservationId}`}
                          className="font-mono font-medium text-primary-600 underline-offset-4 hover:underline"
                        >
                          {row.bookingCode}
                        </Link>
                        <span>{row.travelerName || row.travelerEmail}</span>
                        <span className="text-caption text-muted">
                          {bookingDates(row.startDate, row.endDate, locale)}
                        </span>
                        <Tag className="self-start">
                          {t('matrix.started', {
                            timer: timerLabel(row),
                            time: opsTime(row.waitingSince, locale),
                          })}
                        </Tag>
                      </div>
                    </TableHead>
                    <TableCell className="align-top">{timerCell(row)}</TableCell>
                    {COLUMNS.map((column) => {
                      const items = row.serviceItems.filter(
                        (item) => item.serviceType === column.type,
                      );
                      const service = t(`matrix.columns.${column.key}`);
                      return (
                        <TableCell key={column.key} className="align-top">
                          {items.length === 0 ? (
                            <span className="text-caption text-muted">—</span>
                          ) : (
                            <div className="flex flex-col gap-3">
                              {items.map((item) => itemCell(row, item, service))}
                            </div>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <p className="border-t px-5 py-3 text-caption text-muted">
          {t('matrix.rule', timerCopy(clock))}
        </p>
      </section>

      <RedispatchPanel
        from="dashboard"
        clock={clock}
        target={target}
        onClose={() => setTarget(null)}
        onOffered={() => {
          restoreFocusTo.current = target?.reservationId ?? null;
          void alerts!.refresh();
        }}
      />
    </div>
  );
}

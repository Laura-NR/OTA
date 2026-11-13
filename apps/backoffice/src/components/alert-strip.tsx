'use client';

import { Button, buttonClassName, cn, Icon } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { opsTime } from '@/lib/ops-format';

import { DASHBOARD_PATH, useDeskAlerts, type FlaggedItem } from './desk-alerts';

/** The bookings with a red alert nobody has acknowledged, in board order. */
function unacknowledgedRows(
  entries: FlaggedItem[],
  isAcknowledged: (item: FlaggedItem['item']) => boolean,
): FlaggedItem['row'][] {
  const seen = new Set<string>();
  const result: FlaggedItem['row'][] = [];
  for (const { row, item } of entries) {
    if (isAcknowledged(item) || seen.has(row.reservationId)) continue;
    seen.add(row.reservationId);
    result.push(row);
  }
  return result;
}

export interface AlertStripProps {
  /** Where "Go to matrix" leads: the matrix on this page, or on the dashboard. */
  matrixHref: string;
  /**
   * Offer an Acknowledge button per red booking, for pages without the
   * matrix (which has its own per row).
   */
  acknowledgeHere?: boolean;
}

/**
 * A-Dashboard's alert strip: red with an icon and words while any alert is
 * red, amber otherwise, plain while only the mute is on. It names the
 * bookings, leads to the matrix, offers "Mute 15 min" and "Unmute" to those
 * who re-dispatch, and says when the cue waits for a first click.
 */
export function AlertStrip({ matrixHref, acknowledgeHere = false }: AlertStripProps) {
  const t = useTranslations('backoffice.dashboard');
  const locale = useLocale();
  const alerts = useDeskAlerts();
  if (!alerts) {
    return null;
  }
  const { red, amber, mute, muteActive, muteBusy, canManage, soundReady } = alerts;

  if (red.length + amber.length === 0 && !muteActive) {
    return alerts.alertError ? (
      <p role="alert" className="text-body-sm text-error-700">
        {alerts.alertError}
      </p>
    ) : null;
  }

  const codes = (entries: FlaggedItem[]) =>
    [...new Set(entries.map((entry) => entry.row.bookingCode))].join(', ');
  const stripButton = cn(
    buttonClassName({ variant: 'secondary', size: 'sm' }),
    red.length > 0 && 'border-transparent bg-neutral-0 text-error-700',
  );
  const toAcknowledge =
    acknowledgeHere && canManage ? unacknowledgedRows(red, alerts.isAcknowledged) : [];

  function acknowledge(row: FlaggedItem['row']) {
    // The button leaves the strip; the page's start is where focus can rest.
    document.getElementById('main')?.focus();
    alerts!.acknowledge(row);
  }

  return (
    <>
      <div
        className={cn(
          'flex flex-col gap-2 rounded-md px-4 py-3 text-body-sm',
          red.length > 0
            ? 'bg-error-600 text-neutral-0'
            : amber.length > 0
              ? 'border border-warning-500 bg-warning-100 text-warning-700'
              : 'border bg-surface text-secondary',
        )}
      >
        {red.length + amber.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <Icon name="alert-circle" />
            <p className="min-w-60 flex-1">
              {red.length > 0 ? (
                <>
                  <strong>{t('banner.red', { count: red.length })}</strong> · {codes(red)}
                  .{' '}
                </>
              ) : null}
              {amber.length > 0 ? (
                <>
                  <strong>{t('banner.amber', { count: amber.length })}</strong> ·{' '}
                  {codes(amber)}.
                </>
              ) : null}
            </p>
            {matrixHref.startsWith('#') ? (
              <a href={matrixHref} className={stripButton}>
                {t('banner.goToMatrix')}
              </a>
            ) : (
              <Link href={matrixHref} className={stripButton}>
                {t('banner.goToMatrix')}
              </Link>
            )}
            {toAcknowledge.map((row) => (
              <Button
                key={row.reservationId}
                size="sm"
                variant="secondary"
                className={stripButton}
                onClick={() => acknowledge(row)}
              >
                {t('acknowledge.label', { code: row.bookingCode })}
              </Button>
            ))}
            {canManage && !muteActive ? (
              <Button
                size="sm"
                variant="secondary"
                className={stripButton}
                loading={muteBusy}
                onClick={() => void alerts.changeMute(true)}
              >
                {t('audio.mute')}
              </Button>
            ) : null}
          </div>
        ) : null}
        {muteActive || red.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <Icon name="bell" />
            <p className="min-w-60 flex-1">
              {muteActive && mute
                ? t('audio.muted', {
                    time: opsTime(mute.until, locale),
                    name: mute.by ?? t('audio.someone'),
                  })
                : t('audio.repeats')}
              {red.length > 0 && !soundReady ? ` ${t('audio.locked')}` : null}
            </p>
            {red.length > 0 && !soundReady ? (
              <Button
                size="sm"
                variant="secondary"
                className={stripButton}
                onClick={alerts.unlockSound}
              >
                {t('audio.unlock')}
              </Button>
            ) : null}
            {muteActive && canManage ? (
              <Button
                size="sm"
                variant="secondary"
                className={stripButton}
                loading={muteBusy}
                onClick={() => void alerts.changeMute(false)}
              >
                {t('audio.unmute')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {alerts.alertError ? (
        <p role="alert" className="text-body-sm text-error-700">
          {alerts.alertError}
        </p>
      ) : null}
    </>
  );
}

/**
 * The strip on every shell page but the dashboard, which draws its own above
 * the matrix: the alerts follow the person around the desk (owner decision
 * 2026-10-31).
 */
export function ShellAlertStrip() {
  const pathname = usePathname();
  if (pathname === DASHBOARD_PATH) {
    return null;
  }
  return (
    <div className="mb-6 flex flex-col gap-2 empty:hidden">
      <AlertStrip matrixHref={`${DASHBOARD_PATH}#matrix`} acknowledgeHere />
    </div>
  );
}

/**
 * The crossings' live regions (A-A11y 01), first in every shell page's main:
 * red is assertive, amber polite; the ticking timers stay silent.
 */
export function AlertAnnouncements() {
  const alerts = useDeskAlerts();
  if (!alerts) {
    return null;
  }
  const { announced } = alerts;
  return (
    <>
      <div role="alert" className="sr-only">
        {announced.red ? <p key={announced.seq}>{announced.red}</p> : null}
      </div>
      <div role="status" className="sr-only">
        {announced.amber ? <p key={announced.seq}>{announced.amber}</p> : null}
      </div>
    </>
  );
}

import { RESERVATION_STATUSES, nextStatuses, travelerStatus } from '@ota/domain';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@ota/ui';
import { getTranslations } from 'next-intl/server';

import { deskClock, timerCopy } from '@/lib/desk-clock';
import { getThresholds } from '@/lib/operating';

/**
 * A-Bookings' "Who acts in each state": for every system state, the label the
 * traveler sees (DS 03), who moves it on, its clock and the states it can go
 * to next, which come from the state machine itself.
 */
export async function WhoActsLegend() {
  const t = await getTranslations('backoffice.bookings.legend');
  const traveler = await getTranslations('status.traveler');
  const thresholds = await getThresholds();
  const clockCopy = {
    ...timerCopy(deskClock(thresholds)),
    months: thresholds.retentionTriggerMonths,
    days: thresholds.retentionGraceDays,
  };

  return (
    <section aria-labelledby="who-acts-title" className="rounded-lg border bg-surface">
      <div className="flex flex-col gap-0.5 px-5 pb-3 pt-4">
        <h2 id="who-acts-title" className="font-display text-h2-compact">
          {t('title')}
        </h2>
        <p className="text-caption text-muted">{t('description')}</p>
      </div>
      <dl className="flex flex-col divide-y border-t md:hidden">
        {RESERVATION_STATUSES.map((status) => {
          const next = nextStatuses(status);
          return (
            <div key={status} className="flex flex-col gap-1 px-5 py-3 text-body-sm">
              <dt className="font-mono text-caption">{status}</dt>
              <dd>
                <span className="font-medium">{traveler(travelerStatus(status))}</span>
                {' · '}
                {t(`whoActs.${status}`)}
              </dd>
              <dd className="text-caption text-muted">
                {t('clock')}: {t(`clocks.${status}`, clockCopy)} · {t('leaves')}:{' '}
                {next.length > 0 ? next.join(' · ') : '—'}
              </dd>
            </div>
          );
        })}
      </dl>
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t('state')}</TableHead>
            <TableHead scope="col">{t('sees')}</TableHead>
            <TableHead scope="col">{t('who')}</TableHead>
            <TableHead scope="col">{t('clock')}</TableHead>
            <TableHead scope="col">{t('leaves')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {RESERVATION_STATUSES.map((status) => {
            const next = nextStatuses(status);
            return (
              <TableRow key={status}>
                <TableCell className="whitespace-nowrap align-top font-mono text-caption">
                  {status}
                </TableCell>
                <TableCell className="whitespace-nowrap align-top">
                  {traveler(travelerStatus(status))}
                </TableCell>
                <TableCell className="min-w-56 align-top">
                  {t(`whoActs.${status}`)}
                </TableCell>
                <TableCell className="min-w-40 align-top text-secondary">
                  {t(`clocks.${status}`, clockCopy)}
                </TableCell>
                <TableCell className="align-top font-mono text-caption">
                  {next.length > 0 ? next.join(' · ') : '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

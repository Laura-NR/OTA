'use client';

import type {
  OpsLiteClockDto,
  OpsLitePipelineDto,
  OpsLitePipelineRowDto,
} from '@ota/schemas';
import { buttonClassName, cn, Icon, Tag } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useDeskLocked } from '@/components/desk-idle-lock';
import { bookingDates, calendarDate, countdown, opsTime } from '@/lib/ops-format';

/** How often the screen reads the pipeline again ("Live"). */
const REFRESH_MS = 30_000;

/** Each state's dot (AL-Pipeline); the board's #C98A00 is accent 600. */
const DOTS: Record<string, string> = {
  ITINERARY_SUBMITTED: 'bg-info-700',
  DISPATCH_IN_PROGRESS: 'bg-accent-500',
  ASSEMBLY_AND_ESCALATION: 'bg-warning-500',
  ACTION_REQUIRED: 'bg-error-600',
  SECURED_AND_INVOICED: 'bg-accent-500',
  PENDING_PAYMENT: 'bg-accent-600',
  CONFIRMED: 'bg-success-600',
  IN_PROGRESS: 'bg-primary-600',
  COMPLETED: 'bg-neutral-500',
  CANCELLED: 'bg-error-700',
};

const TONES: Record<OpsLiteClockDto['tone'], string> = {
  default: 'text-default',
  warning: 'text-warning-700',
  error: 'text-error-700',
  success: 'text-success-700',
  info: 'text-info-700',
  muted: 'text-secondary',
};

const SCENARIO_KEYS = ['outage', 'hurricane', 'fuel', 'casa', 'flight'];

/**
 * AL-Pipeline: the bookings by state on a phone, read-only. Who is on the
 * ground now and where (a province with an open case is flagged), the state
 * machine with each state's count and most pressing bookings (tap a state),
 * and today's movements. It reads the pipeline again every 30 s; the actions
 * stay on Alerts and on the desk.
 */
export function LitePipeline({ pipeline }: { pipeline: OpsLitePipelineDto }) {
  const t = useTranslations('backoffice.opsLite.pipeline');
  const locale = useLocale();
  const router = useRouter();
  const locked = useDeskLocked();
  const [selected, setSelected] = useState<string | null>(
    pipeline.states.find((state) => state.status === 'ACTION_REQUIRED' && state.count > 0)
      ?.status ??
      pipeline.states.find((state) => state.status === 'ASSEMBLY_AND_ESCALATION')
        ?.status ??
      null,
  );

  useEffect(() => {
    if (locked) return;
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [locked]);

  /** "3 min", "22 h", "48 d": how long a booking has waited, as the board reads it. */
  function waited(ms: number): string {
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 60) return t('clock.minutes', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return t('clock.hours', { count: hours });
    return t('clock.days', { count: Math.floor(hours / 24) });
  }

  function clockText(clock: OpsLiteClockDto): string {
    switch (clock.kind) {
      case 'waiting':
        return waited(clock.ms);
      case 'left':
        return countdown(clock.ms);
      case 'expired':
        return t('clock.expired');
      case 'starts':
        return clock.days <= 0
          ? t('clock.today')
          : t('clock.inDays', { days: clock.days });
      case 'day':
        return t('clock.day', { day: clock.day });
      case 'date':
        return calendarDate(clock.date, locale);
    }
  }

  function who(
    row:
      | OpsLitePipelineRowDto
      | { travelerName: string | null; travelerEmail: string; partySize: number },
  ) {
    const name = row.travelerName || row.travelerEmail;
    return row.partySize > 1 ? t('party', { name, more: row.partySize - 1 }) : name;
  }

  const ground = pipeline.ground;
  const worstCase = ground.cases[0];

  return (
    <div className="flex flex-col gap-3 px-5 pb-6 pt-3.5">
      <section
        aria-labelledby="ground-title"
        className="flex flex-col gap-2 rounded-lg border bg-surface p-3.5"
      >
        <div className="flex items-center gap-2">
          <h2 id="ground-title" className="text-overline uppercase text-primary-600">
            {t('ground.title')}
          </h2>
          <span className="ml-auto inline-flex h-6 items-center rounded-full bg-info-100 px-2.5 text-caption font-semibold text-info-700">
            {t('ground.travelers', { count: ground.travelers })}
          </span>
        </div>
        <p className="text-caption text-muted">
          {ground.bookings === 0
            ? t('ground.none')
            : t('ground.trips', { count: ground.bookings })}
        </p>
        {ground.provinces.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {ground.provinces.map((entry) => (
              <li key={entry.province}>
                <Tag className={cn(entry.scenario && 'bg-warning-100 text-warning-700')}>
                  {entry.scenario
                    ? t('ground.provinceCase', {
                        province: entry.province,
                        count: entry.travelers,
                        scenario: SCENARIO_KEYS.includes(entry.scenario)
                          ? t(`scenarios.${entry.scenario}`)
                          : entry.scenario,
                      })
                    : t('ground.province', {
                        province: entry.province,
                        count: entry.travelers,
                      })}
                </Tag>
              </li>
            ))}
          </ul>
        ) : null}
        {worstCase ? (
          <Link
            href={`/disruptions/${worstCase.id}`}
            className={cn(
              buttonClassName({ variant: 'secondary', size: 'md' }),
              'self-start',
            )}
          >
            {t('ground.case', {
              reference: worstCase.reference,
              severity: t(`severities.${worstCase.severity}`),
            })}
            {ground.cases.length > 1 ? ` · +${ground.cases.length - 1}` : null}
          </Link>
        ) : null}
      </section>

      <section
        aria-labelledby="states-title"
        className="flex flex-col rounded-lg border bg-surface"
      >
        <div className="flex items-center gap-2 px-3.5 pb-1.5 pt-3.5">
          <h2 id="states-title" className="text-overline uppercase text-primary-600">
            {t('states.title')}
          </h2>
          <span className="ml-auto text-caption text-muted">{t('states.spec')}</span>
        </div>
        <ul>
          {pipeline.states.map((state) => {
            const on = selected === state.status;
            const panelId = `state-${state.status}`;
            const more = state.count - state.rows.length;
            return (
              <li key={state.status} className="border-t first:border-t-0">
                <h3>
                  <button
                    type="button"
                    aria-expanded={on}
                    aria-controls={panelId}
                    onClick={() => setSelected(on ? null : state.status)}
                    className={cn(
                      'flex min-h-touch w-full items-center gap-2.5 px-3.5 py-3 text-left focus-visible:-outline-offset-2',
                      on && 'bg-primary-100',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        DOTS[state.status],
                      )}
                    />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate font-mono text-caption',
                        on ? 'text-primary-700' : 'text-default',
                      )}
                    >
                      {state.status}
                    </span>
                    <span className="font-mono text-body-sm font-medium">
                      {state.count}
                    </span>
                    <Icon
                      name={on ? 'chevron-up' : 'chevron-down'}
                      className="h-4 w-4 text-muted"
                    />
                  </button>
                </h3>
                <div
                  id={panelId}
                  // A class, not `hidden`: the flex utility would override the attribute.
                  className={cn(
                    on ? 'flex' : 'hidden',
                    'flex-col gap-2 px-3.5 pb-3.5 pt-1',
                  )}
                >
                  <p className="text-caption text-muted">{t(`who.${state.status}`)}</p>
                  {state.rows.length === 0 ? (
                    <p className="text-body-sm text-muted">{t('states.empty')}</p>
                  ) : null}
                  {state.rows.map((row) => (
                    <div
                      key={row.reservationId}
                      className="flex items-center gap-2.5 rounded-md bg-page px-3 py-2.5"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-body-sm">
                          <Link
                            href={`/bookings/${row.reservationId}`}
                            className="font-mono text-primary-600 underline-offset-4 hover:underline"
                          >
                            {row.bookingCode}
                          </Link>{' '}
                          · {who(row)}
                        </span>
                        <span className="text-caption text-muted">
                          {[
                            row.provinces.join(', '),
                            bookingDates(row.startDate, row.endDate, locale),
                            row.serviceItemCount > 0
                              ? t('accepted', {
                                  accepted: row.serviceItemsAccepted,
                                  total: row.serviceItemCount,
                                })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'whitespace-nowrap font-mono text-label font-medium',
                          TONES[row.clock.tone],
                        )}
                      >
                        {clockText(row.clock)}
                      </span>
                      {row.travelerPhone ? (
                        <a
                          href={`tel:${row.travelerPhone}`}
                          aria-label={t('call', {
                            name: row.travelerName || row.travelerEmail,
                          })}
                          className={buttonClassName({
                            variant: 'secondary',
                            size: 'icon',
                          })}
                        >
                          <Icon name="phone" />
                        </a>
                      ) : null}
                    </div>
                  ))}
                  {more > 0 ? (
                    <Link
                      href={`/bookings?state=${state.status}`}
                      className="text-caption font-medium text-primary-600 underline underline-offset-4"
                    >
                      {t('states.more', { count: more })}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-labelledby="movements-title"
        className="flex flex-col gap-2 rounded-lg border bg-surface p-3.5"
      >
        <h2 id="movements-title" className="text-overline uppercase text-primary-600">
          {t('movements.title')}
        </h2>
        {pipeline.movements.length === 0 ? (
          <p className="text-body-sm text-muted">{t('movements.none')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pipeline.movements.map((movement) => (
              <li
                key={`${movement.kind}-${movement.reservationId}`}
                className="flex items-center gap-2.5 rounded-md bg-page px-3 py-2.5"
              >
                <span className="w-11 shrink-0 font-mono text-label text-primary-700">
                  {movement.at ? opsTime(movement.at, locale) : t('movements.allDay')}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-body-sm">
                    {t(`movements.${movement.kind}`, {
                      code: movement.bookingCode,
                      who: who(movement),
                    })}
                  </span>
                  <Link
                    href={`/bookings/${movement.reservationId}`}
                    className="self-start text-caption text-primary-600 underline-offset-4 hover:underline"
                  >
                    {t('movements.open')}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-caption text-muted">{t('note')}</p>
    </div>
  );
}

'use client';

import { redAlertCards, redSince, timerElapsed } from '@ota/domain';
import type { PaymentScheduleDto, RefundDto } from '@ota/schemas';
import { Alert, Badge, Button, buttonClassName, cn, Icon, type IconName } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { apiRequest } from '@/lib/client-api';
import type { DeskClock } from '@/lib/desk-clock';
import { MATRIX_COLUMNS } from '@/lib/matrix-columns';
import { bookingDates, countdown, money, opsDate, opsTime } from '@/lib/ops-format';

import { RefundActions } from '../refund-actions';
import { useDeskAlerts, type FlaggedItem } from '../desk-alerts';
import { OPEN_ITEM_STATUSES } from '../service-item-status';
import { LiteRedispatch } from './lite-redispatch';

export interface LitePaymentAlert {
  reservationId: string;
  bookingCode: string;
  traveler: string;
  kind: 'WINDOW_EXPIRED' | 'BALANCE_OVERDUE';
  amount: string;
  currency: string;
  dueAt: string;
}

export interface LiteCredentialAlert {
  supplierId: string;
  name: string;
  expiresAt: string | null;
}

/** An offer sent from this screen, said until dismissed (the card itself leaves the red list). */
interface SentOffer {
  key: string;
  bookingCode: string;
  service: string;
  name: string;
  at: Date;
}

const toDate = (value: string | null) => (value ? new Date(value) : null);

function itemRedSince(entry: FlaggedItem): Date | null {
  return redSince({
    status: entry.item.status,
    deadline: toDate(entry.item.deadline),
    respondedAt: toDate(entry.item.respondedAt),
  });
}

/** A 36 px tile with the card's icon (AL-Alerts). */
function Tile({ icon, className }: { icon: IconName; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
        className,
      )}
    >
      <Icon name={icon} />
    </span>
  );
}

/** The 6 px timer bar, named for a screen reader by its share. */
function TimerBar({
  share,
  fill,
  label,
}: {
  share: number;
  fill: string;
  label: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className="block h-1.5 overflow-hidden rounded-full bg-neutral-200"
    >
      <span
        className={cn('block h-full', fill)}
        style={{ width: `${Math.round(share * 100)}%` }}
      />
    </span>
  );
}

function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cn(
        'flex flex-col gap-2.5 rounded-lg border bg-surface p-3.5',
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * AL-Alerts: the desk's triage on a phone. Red offers come first, one card a
 * booking led by its oldest red item, with the call, an inline re-dispatch
 * and the acknowledgement that stops the cue; then amber offers, refunds
 * waiting for an approval, first payments and balances past due (with "Extend
 * 24 h"), and credentials running out. The red and amber feed is the desk's
 * own (`DeskAlerts`); the rest is read by the page.
 */
export function LiteAlerts({
  payments,
  refunds,
  credentials,
  clock,
  canPay,
  canVote,
  you,
}: {
  payments: LitePaymentAlert[];
  refunds: RefundDto[];
  credentials: LiteCredentialAlert[];
  clock: DeskClock;
  /** May extend a payment window (the payments row). */
  canPay: boolean;
  /** May approve or reject a refund (never through an override). */
  canVote: boolean;
  /** The signed-in person's name, for "logged as". */
  you: string;
}) {
  const t = useTranslations('backoffice.opsLite.alerts');
  const columns = useTranslations('backoffice.dashboard.matrix.columns');
  const reasons = useTranslations('backoffice.payments.refundReasons');
  const locale = useLocale();
  const router = useRouter();
  const alerts = useDeskAlerts();
  /** Which booking's red card is open; the first one starts open. */
  const [open, setOpen] = useState<Record<string, boolean>>({});
  /** The item whose re-dispatch list is showing. */
  const [redispatching, setRedispatching] = useState<string | null>(null);
  const [sent, setSent] = useState<SentOffer[]>([]);
  const [extending, setExtending] = useState<string | null>(null);
  const [extended, setExtended] = useState<Record<string, string>>({});
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [permission, setPermission] = useState<
    NotificationPermission | 'unsupported' | null
  >(null);

  useEffect(() => {
    setPermission(
      typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
    );
  }, []);

  if (!alerts) {
    throw new Error('LiteAlerts renders inside Ops Lite (DeskAlerts).');
  }
  const { red, amber, now, canManage } = alerts;

  const service = (type: string) => {
    const column = MATRIX_COLUMNS.find((candidate) => candidate.type === type);
    return column ? columns(column.key) : type;
  };
  const cards = redAlertCards(
    red.map((entry) => ({
      ...entry,
      bookingId: entry.row.reservationId,
      since: itemRedSince(entry),
    })),
  );
  const pending = refunds.filter((refund) => refund.status === 'REQUESTED');
  const nothing =
    cards.length +
      amber.length +
      pending.length +
      payments.length +
      credentials.length ===
    0;

  function offered(entry: FlaggedItem, name: string) {
    setRedispatching(null);
    setSent((list) => [
      {
        key: `${entry.item.id}:${Date.now()}`,
        bookingCode: entry.row.bookingCode,
        service: service(entry.item.serviceType),
        name,
        at: new Date(),
      },
      ...list,
    ]);
    void alerts!.refresh();
  }

  async function extend(payment: LitePaymentAlert) {
    setExtending(payment.reservationId);
    setPaymentError(null);
    try {
      const schedule = await apiRequest<PaymentScheduleDto>(
        `/reservations/${payment.reservationId}/schedule`,
      );
      if (!schedule.nextInstalmentId) throw new Error(t('payments.nothingDue'));
      const instalment = await apiRequest<{ dueAt: string }>(
        `/reservations/${payment.reservationId}/instalments/${schedule.nextInstalmentId}/extend`,
        { method: 'POST', body: JSON.stringify({ hours: 24 }) },
      );
      setExtended((done) => ({ ...done, [payment.reservationId]: instalment.dueAt }));
      router.refresh();
    } catch (error) {
      setPaymentError(
        t('payments.failed', {
          code: payment.bookingCode,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setExtending(null);
    }
  }

  async function allowNotifications() {
    setPermission(await Notification.requestPermission());
  }

  function redispatchControl(
    entry: FlaggedItem,
    label: string,
    variant: 'destructive' | 'secondary',
  ) {
    if (!canManage || !OPEN_ITEM_STATUSES.includes(entry.item.status)) return null;
    return redispatching === entry.item.id ? (
      <LiteRedispatch
        serviceItemId={entry.item.id}
        clock={clock}
        onOffered={(name) => offered(entry, name)}
        onCancel={() => setRedispatching(null)}
      />
    ) : (
      <Button
        size={variant === 'destructive' ? 'lg' : 'md'}
        variant={variant}
        className={variant === 'destructive' ? 'w-full' : 'self-start'}
        onClick={() => setRedispatching(entry.item.id)}
      >
        {label}
      </Button>
    );
  }

  function callButton(entry: FlaggedItem) {
    if (!entry.item.workerPhone) return null;
    const name = entry.item.supplierName ?? t('noWorker');
    return (
      <a
        href={`tel:${entry.item.workerPhone}`}
        className={buttonClassName({ variant: 'secondary', size: 'md' })}
      >
        <Icon name="phone" />
        {t('call', { name: name.split(' ')[0] ?? name })}
      </a>
    );
  }

  const openBooking = (reservationId: string) => (
    <Link
      href={`/bookings/${reservationId}`}
      className={buttonClassName({ variant: 'tertiary', size: 'md' })}
    >
      {t('openBooking')}
    </Link>
  );

  const redTitle = (entry: FlaggedItem) =>
    t(entry.item.status === 'DECLINED' ? 'red.declined' : 'red.timedOut', {
      service: service(entry.item.serviceType),
      worker: entry.item.supplierName ?? t('noWorker'),
    });

  const bookingLine = (entry: FlaggedItem) =>
    [
      entry.row.bookingCode,
      entry.row.travelerName || entry.row.travelerEmail,
      [entry.item.province, bookingDates(entry.row.startDate, entry.row.endDate, locale)]
        .filter(Boolean)
        .join(' '),
    ].join(' · ');

  return (
    <div className="flex flex-col gap-3 px-5 pb-6 pt-3.5">
      <ul aria-label={t('summary')} className="flex flex-wrap gap-1.5">
        <li>
          <Badge variant="timeout">{t('pills.red', { count: red.length })}</Badge>
        </li>
        <li>
          <Badge variant="attention">{t('pills.amber', { count: amber.length })}</Badge>
        </li>
        <li>
          <Badge variant="accent">
            {t('pills.approvals', { count: pending.length })}
          </Badge>
        </li>
        <li>
          <Badge variant="secondary">
            {t('pills.payments', { count: payments.length })}
          </Badge>
        </li>
      </ul>

      {permission === 'default' ? (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => void allowNotifications()}
        >
          <Icon name="bell" />
          {t('push.enable')}
        </Button>
      ) : null}
      {permission === 'denied' ? (
        <p className="text-caption text-muted">{t('push.blocked')}</p>
      ) : null}
      {red.length > 0 && !alerts.soundReady ? (
        <p className="text-caption text-muted">{t('sound.locked')}</p>
      ) : null}
      {alerts.alertError ? (
        <p role="alert" className="text-body-sm text-error-700">
          {alerts.alertError}
        </p>
      ) : null}

      <div role="status" className="flex flex-col gap-2 empty:hidden">
        {sent.map((offer) => (
          <div
            key={offer.key}
            className="flex items-start gap-2.5 rounded-md bg-info-100 px-3 py-2.5 text-body-sm text-info-700"
          >
            <Icon name="check" className="mt-0.5" />
            <p className="flex-1">
              {t.rich('offered', {
                name: offer.name,
                service: offer.service,
                code: offer.bookingCode,
                time: opsTime(offer.at, locale),
                you,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <Button
              size="icon"
              variant="tertiary"
              aria-label={t('dismiss')}
              className="-my-2 text-info-700"
              onClick={() =>
                setSent((list) => list.filter((item) => item.key !== offer.key))
              }
            >
              <Icon name="x" />
            </Button>
          </div>
        ))}
      </div>

      {cards.map((card, index) => {
        const lead = card.lead;
        const acknowledged = [lead, ...card.others].every((entry) =>
          alerts.isAcknowledged(entry.item),
        );
        const isOpen = open[card.bookingId] ?? index === 0;
        const since = lead.since;
        const ack = lead.item.acknowledgement;
        const panelId = `red-${card.bookingId}`;
        return (
          <Card
            key={card.bookingId}
            className={cn(
              'border-error-600',
              acknowledged ? 'bg-surface' : 'bg-error-100',
            )}
          >
            <h2>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() =>
                  setOpen((state) => ({ ...state, [card.bookingId]: !isOpen }))
                }
                className="flex w-full items-start gap-3 text-left focus-visible:outline-offset-2"
              >
                <Tile icon="alert-triangle" className="bg-error-600 text-neutral-0" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <strong className="text-nav font-semibold text-default">
                    {redTitle(lead)}
                  </strong>
                  <span className="text-caption text-muted">
                    {[
                      bookingLine(lead),
                      since ? t('red.since', { time: opsTime(since, locale) }) : null,
                      acknowledged
                        ? ack
                          ? t('red.acknowledged', {
                              name: ack.by ?? t('someone'),
                              time: opsTime(ack.at, locale),
                            })
                          : t('red.acknowledging')
                        : t('red.audio'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <Icon
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  className="mt-1.5 text-muted"
                />
              </button>
            </h2>
            <div
              id={panelId}
              // A class, not `hidden`: the flex utility would override the attribute.
              className={cn(isOpen ? 'flex' : 'hidden', 'flex-col gap-2.5')}
            >
              {lead.item.offeredAt && lead.item.deadline ? (
                <div className="flex flex-col gap-1">
                  <TimerBar
                    share={1}
                    fill="bg-error-600"
                    label={t('elapsed', { percent: 100 })}
                  />
                  <span className="text-caption text-muted">
                    {[
                      t('red.offeredAt', { time: opsTime(lead.item.offeredAt, locale) }),
                      lead.item.status === 'DECLINED' && lead.item.respondedAt
                        ? t('red.declinedAt', {
                            time: opsTime(lead.item.respondedAt, locale),
                          })
                        : t('red.deadline', {
                            time: opsTime(lead.item.deadline, locale),
                          }),
                    ].join(' · ')}
                  </span>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {callButton(lead)}
                {openBooking(card.bookingId)}
              </div>
              {redispatchControl(lead, t('red.redispatch'), 'destructive')}
              {card.others.map((other) => (
                <div
                  key={other.item.id}
                  className="flex flex-col gap-1 rounded-md bg-error-100 px-3 py-2.5 text-error-700"
                >
                  <strong className="text-body-sm">
                    {t('red.also', {
                      what: redTitle(other),
                      time: other.since ? opsTime(other.since, locale) : '—',
                    })}
                  </strong>
                  {redispatchControl(
                    other,
                    t('red.redispatchService', {
                      service: service(other.item.serviceType),
                    }),
                    'secondary',
                  )}
                </div>
              ))}
              {canManage && !acknowledged ? (
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full"
                  onClick={() => alerts.acknowledge(lead.row)}
                >
                  {t('red.acknowledge')}
                </Button>
              ) : null}
            </div>
          </Card>
        );
      })}

      {amber.map((entry) => {
        const offeredAt = toDate(entry.item.offeredAt);
        const deadline = toDate(entry.item.deadline);
        const share =
          offeredAt && deadline ? Math.min(1, timerElapsed(offeredAt, deadline, now)) : 0;
        const left = deadline ? Math.max(0, deadline.getTime() - now.getTime()) : 0;
        return (
          <Card key={entry.item.id} className="border-warning-500 bg-accent-50">
            <div className="flex items-start gap-3">
              <Tile icon="clock" className="bg-warning-500 text-neutral-900" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h2 className="text-nav font-semibold">
                  {t('amber.title', {
                    service: service(entry.item.serviceType),
                    percent: Math.round(share * 100),
                    left: countdown(left),
                  })}
                </h2>
                <p className="text-caption text-muted">
                  {[bookingLine(entry), entry.item.supplierName ?? t('noWorker')].join(
                    ' · ',
                  )}
                </p>
              </div>
            </div>
            <TimerBar
              share={share}
              fill="bg-warning-600"
              label={t('elapsed', { percent: Math.round(share * 100) })}
            />
            <div className="flex flex-wrap gap-2">
              {callButton(entry)}
              {openBooking(entry.row.reservationId)}
            </div>
            {redispatchControl(entry, t('amber.redispatch'), 'secondary')}
          </Card>
        );
      })}

      {pending.map((refund) => (
        <Card key={refund.id}>
          <div className="flex items-start gap-3">
            <Tile icon="credit-card" className="bg-accent-500 text-neutral-900" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h2 className="text-nav font-semibold">
                {t('approvals.title', {
                  amount: money(Number(refund.amount), refund.currency, locale),
                })}
              </h2>
              <p className="text-caption text-muted">
                {[
                  refund.bookingCode,
                  reasons(refund.reason),
                  refund.requestedByEmail
                    ? t('approvals.requestedBy', { name: refund.requestedByEmail })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {refund.approvals.map((approval) => (
                <p key={approval.createdAt} className="text-caption text-muted">
                  {t(approval.approve ? 'approvals.approved' : 'approvals.rejected', {
                    name: approval.approverEmail ?? t('someone'),
                    time: opsTime(approval.createdAt, locale),
                  })}
                </p>
              ))}
            </div>
          </div>
          <RefundActions
            refund={refund}
            canManage={canVote}
            canVote={canVote}
            size="md"
          />
        </Card>
      ))}

      {paymentError ? (
        <p role="alert" className="text-body-sm text-error-700">
          {paymentError}
        </p>
      ) : null}
      {payments.map((payment) => {
        const done = extended[payment.reservationId];
        return (
          <Card key={payment.reservationId}>
            <div className="flex items-start gap-3">
              <Tile icon="clock" className="bg-neutral-100 text-neutral-700" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h2 className="text-nav font-semibold">
                  {t(
                    payment.kind === 'WINDOW_EXPIRED'
                      ? 'payments.windowExpired'
                      : 'payments.balanceOverdue',
                  )}
                </h2>
                <p className="text-caption text-muted">
                  {t('payments.body', {
                    code: payment.bookingCode,
                    traveler: payment.traveler,
                    amount: money(Number(payment.amount), payment.currency, locale),
                    due: `${opsDate(payment.dueAt, locale)} ${opsTime(payment.dueAt, locale)}`,
                  })}
                </p>
              </div>
            </div>
            {done ? (
              <Alert variant="success">
                {t('payments.extended', {
                  when: `${opsDate(done, locale)} ${opsTime(done, locale)}`,
                })}
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {canPay && !done ? (
                <Button
                  variant="secondary"
                  loading={extending === payment.reservationId}
                  disabled={extending !== null}
                  onClick={() => void extend(payment)}
                >
                  {extending === payment.reservationId
                    ? t('payments.extending')
                    : t('payments.extend')}
                </Button>
              ) : null}
              {openBooking(payment.reservationId)}
            </div>
          </Card>
        );
      })}

      {credentials.map((credential) => (
        <Link
          key={credential.supplierId}
          href={`/suppliers/${credential.supplierId}`}
          className="flex items-start gap-3 rounded-lg border bg-surface p-3.5 opacity-85 hover:bg-neutral-50"
        >
          <Tile icon="shield-check" className="bg-neutral-100 text-neutral-700" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <strong className="text-nav font-semibold">
              {t('credentials.title', { name: credential.name })}
            </strong>
            <span className="text-caption text-muted">
              {t('credentials.body', {
                date: credential.expiresAt ? opsDate(credential.expiresAt, locale) : '—',
              })}
            </span>
          </span>
        </Link>
      ))}

      {nothing ? (
        <p className="rounded-lg border bg-surface p-3.5 text-body-sm text-secondary">
          {t('empty')}
        </p>
      ) : null}

      <p className="text-caption text-muted">{t('note')}</p>
    </div>
  );
}

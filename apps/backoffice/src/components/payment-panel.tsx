'use client';

import type { PaymentIntentDto, PaymentScheduleDto } from '@ota/schemas';
import { Alert, Badge, Button, Label, Select, type BadgeVariant } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';
import { calendarDate, moneyExact, opsDate, opsTime } from '@/lib/ops-format';

import { ProofReview } from './proof-review';
import { RefundActions } from './refund-actions';
import { RefundForm } from './refund-form';

const RAILS = ['CARD', 'OPEN_BANKING_SEPA'] as const;

type Rail = (typeof RAILS)[number];
type Plan = 'FULL' | 'DEPOSIT';

/** Statuses in which a link may be created: the first payment, then the balance (M4 D3). */
const FIRST_LINK = ['SECURED_AND_INVOICED', 'PENDING_PAYMENT'];
const LATER_LINK = [...FIRST_LINK, 'CONFIRMED', 'IN_PROGRESS'];

const RECEIPT_VARIANTS: Record<string, BadgeVariant> = {
  PENDING: 'outline',
  AUTHORIZED: 'info',
  PAID: 'success',
  FAILED: 'destructive',
  REFUNDED: 'secondary',
};

/**
 * A-Booking payments on M4: the schedule (deposit and balance, or the full
 * amount), the link for the next instalment with the plan chosen on the first
 * one, the receipts with their proofs of transfer, more time on a window, and
 * the refunds with their approvals. Confirming still simulates the gateway
 * callback until a real provider with signed webhooks is wired (ADR 0003).
 */
export function PaymentPanel({
  reservationId,
  status,
  canManage,
  schedule,
  now,
}: {
  reservationId: string;
  status: string;
  canManage: boolean;
  schedule: PaymentScheduleDto;
  /** The server's clock (ISO), so overdue marks render the same on both sides. */
  now: string;
}) {
  const t = useTranslations('backoffice.payments');
  const locale = useLocale();
  const router = useRouter();
  const [rail, setRail] = useState<Rail>('CARD');
  const [plan, setPlan] = useState<Plan>('FULL');
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const money = (value: string | number) =>
    moneyExact(Number(value), schedule.currency, locale);
  const when = (value: string) => `${opsDate(value, locale)} · ${opsTime(value, locale)}`;
  const scheduled = schedule.instalments.length > 0;
  const next = schedule.instalments.find(
    (instalment) => instalment.id === schedule.nextInstalmentId,
  );
  const canCreate =
    canManage &&
    (scheduled
      ? Boolean(next) && LATER_LINK.includes(status)
      : FIRST_LINK.includes(status));
  const paidReceipts = schedule.receipts.filter((receipt) => receipt.status === 'PAID');

  async function run<T>(action: () => Promise<T>, failed: string): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      router.refresh();
      return result;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : failed);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createLink() {
    const intent = await run(
      () =>
        apiRequest<PaymentIntentDto>(`/reservations/${reservationId}/payments`, {
          method: 'POST',
          body: JSON.stringify({ rail, ...(scheduled ? {} : { plan }) }),
        }),
      t('createFailed'),
    );
    if (intent) setCheckoutUrl(intent.checkoutUrl);
  }

  return (
    <div className="space-y-4">
      {error ? <Alert variant="destructive">{error}</Alert> : null}

      {scheduled ? (
        <section aria-labelledby="schedule-title" className="space-y-2">
          <h3 id="schedule-title" className="text-body-sm font-semibold text-default">
            {t('schedule')}
          </h3>
          <ul className="divide-y rounded-md border">
            {schedule.instalments.map((instalment) => {
              const overdue =
                instalment.status === 'DUE' &&
                new Date(instalment.dueAt).getTime() < new Date(now).getTime();
              return (
                <li
                  key={instalment.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-body-sm"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {t(`kinds.${instalment.kind}`)} · {money(instalment.amount)}
                    </span>
                    <Badge
                      variant={
                        instalment.status === 'PAID'
                          ? 'success'
                          : overdue
                            ? 'destructive'
                            : instalment.status === 'DUE'
                              ? 'warning'
                              : 'secondary'
                      }
                    >
                      {instalment.status === 'PAID' && instalment.paidAt
                        ? t('instalmentStatus.PAID', {
                            date: opsDate(instalment.paidAt, locale),
                          })
                        : instalment.status === 'DUE'
                          ? t(
                              overdue
                                ? 'instalmentStatus.OVERDUE'
                                : 'instalmentStatus.DUE',
                              {
                                // A balance falls due on a calendar day; a window ends at an instant.
                                date:
                                  instalment.kind === 'BALANCE'
                                    ? calendarDate(instalment.dueAt, locale)
                                    : when(instalment.dueAt),
                              },
                            )
                          : t(`instalmentStatus.${instalment.status}`)}
                    </Badge>
                  </div>
                  {canManage && instalment.status === 'DUE' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            apiRequest(
                              `/reservations/${reservationId}/instalments/${instalment.id}/extend`,
                              { method: 'POST', body: JSON.stringify({ hours: 24 }) },
                            ),
                          t('actionFailed'),
                        )
                      }
                    >
                      {t('extend')}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {schedule.receipts.length === 0 ? (
        <Alert>{t('none')}</Alert>
      ) : (
        <ul className="space-y-2">
          {schedule.receipts.map((receipt) => (
            <li key={receipt.id} className="space-y-2 rounded-md border p-3 text-body-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{receipt.rail.replaceAll('_', ' ')}</Badge>
                  <span className="font-medium">
                    {receipt.currency} {Number(receipt.amount).toFixed(2)}
                  </span>
                  {Number(receipt.feeAmount) > 0 ? (
                    <span className="text-caption text-muted">
                      {t('fee', { amount: money(receipt.feeAmount) })}
                    </span>
                  ) : null}
                  <Badge variant={RECEIPT_VARIANTS[receipt.status] ?? 'outline'}>
                    {receipt.status}
                  </Badge>
                </div>
                {canManage && receipt.status === 'PENDING' ? (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          apiRequest(
                            `/reservations/${reservationId}/payments/${receipt.id}/confirm`,
                            { method: 'POST' },
                          ),
                        t('confirmFailed'),
                      )
                    }
                  >
                    {t('markPaid')}
                  </Button>
                ) : null}
              </div>
              {receipt.proofs.map((proof) => (
                <ProofReview key={proof.id} proof={proof} canManage={canManage} />
              ))}
            </li>
          ))}
        </ul>
      )}

      {canCreate ? (
        <div className="flex flex-wrap items-end gap-2 border-t pt-4">
          {scheduled ? (
            next ? (
              <p className="basis-full text-body-sm text-secondary">
                {t('linkFor', {
                  kind: t(`kinds.${next.kind}`),
                  amount: money(next.amount),
                })}
              </p>
            ) : null
          ) : schedule.options ? (
            <div className="min-w-0 basis-full space-y-1 sm:basis-auto">
              <Label htmlFor="payment-plan">{t('plan')}</Label>
              <Select
                id="payment-plan"
                value={plan}
                onChange={(event) => setPlan(event.target.value as Plan)}
              >
                <option value="FULL">
                  {t('planFull', { amount: money(schedule.options.full.amount) })}
                </option>
                {schedule.options.deposit ? (
                  <option value="DEPOSIT">
                    {t('planDeposit', {
                      percent: schedule.options.deposit.percent,
                      amount: money(schedule.options.deposit.amount),
                      balance: money(schedule.options.deposit.balance),
                      date: calendarDate(schedule.options.deposit.balanceDueAt, locale),
                    })}
                  </option>
                ) : null}
              </Select>
              {!schedule.options.deposit ? (
                <p className="text-caption text-muted">{t('noDeposit')}</p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="payment-rail">{t('rail')}</Label>
            <Select
              id="payment-rail"
              value={rail}
              onChange={(event) => setRail(event.target.value as Rail)}
            >
              {RAILS.map((option) => (
                <option key={option} value={option}>
                  {option === 'CARD' ? t('railCard') : t('railSepa')}
                </option>
              ))}
            </Select>
          </div>
          <Button disabled={busy} onClick={createLink}>
            {busy ? t('working') : t('createLink')}
          </Button>
        </div>
      ) : null}

      {checkoutUrl ? (
        <p className="text-caption text-muted">
          {t('checkoutLink')} <span className="break-all font-mono">{checkoutUrl}</span>
        </p>
      ) : null}

      <section aria-labelledby="refunds-title" className="space-y-2 border-t pt-4">
        <h3 id="refunds-title" className="text-body-sm font-semibold text-default">
          {t('refunds')}
        </h3>
        {schedule.refunds.length === 0 ? (
          <p className="text-body-sm text-muted">{t('noRefunds')}</p>
        ) : (
          <ul className="space-y-2">
            {schedule.refunds.map((refund) => (
              <li
                key={refund.id}
                className="space-y-1 rounded-md border p-3 text-body-sm"
              >
                <p>
                  <span className="font-medium">{money(refund.amount)}</span> ·{' '}
                  {t(`refundReasons.${refund.reason}`)} ·{' '}
                  <span className="text-secondary">{refund.note}</span>
                </p>
                <RefundActions refund={refund} canManage={canManage} />
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <RefundForm reservationId={reservationId} receipts={paidReceipts} />
        ) : null}
      </section>
    </div>
  );
}

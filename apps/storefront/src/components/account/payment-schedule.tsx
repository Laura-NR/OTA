import type { PaymentScheduleDto } from '@ota/schemas';
import { Alert, Badge, type BadgeVariant } from '@ota/ui';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { formatMoney } from '@/lib/format';

import {
  PayInstalmentButton,
  PlanChooser,
  ProofUpload,
  type PlanOption,
} from './payment-actions';

/** Booking statuses in which a payment can be started (spec §7.1, M4 D3). */
const PAYABLE: readonly string[] = [
  'SECURED_AND_INVOICED',
  'PENDING_PAYMENT',
  'CONFIRMED',
  'IN_PROGRESS',
];

const PROOF_BADGES: Record<string, BadgeVariant> = {
  SUBMITTED: 'warning',
  ACCEPTED: 'info',
  REJECTED: 'destructive',
};

/**
 * The trip's payments (Payment board, M4): before the first payment, the
 * choice of deposit or full amount; after it, each instalment with its due
 * date, the pending transfer's bank details and its proof of transfer, and
 * any refunds. Rendered on the server, so amounts and dates are formatted once;
 * only the actions are client components.
 */
export async function PaymentSchedule({
  reservationId,
  status,
  schedule,
  locked,
}: {
  reservationId: string;
  status: string;
  schedule: PaymentScheduleDto;
  /** The OFAC gate holds payment until every US traveler has certified (M3). */
  locked: boolean;
}) {
  const [t, format, locale] = await Promise.all([
    getTranslations('account.payment'),
    getFormatter(),
    getLocale(),
  ]);
  const money = (value: string) => formatMoney(value, schedule.currency, locale);
  const day = (value: string) =>
    format.dateTime(new Date(value), { day: 'numeric', month: 'short', year: 'numeric' });
  const now = Date.now();
  const payable = PAYABLE.includes(status);
  const next = schedule.instalments.find(
    (instalment) => instalment.id === schedule.nextInstalmentId,
  );
  const pending = next
    ? schedule.receipts
        .filter(
          (receipt) =>
            receipt.instalmentId === next.id &&
            receipt.status === 'PENDING' &&
            receipt.rail !== 'CARD',
        )
        .at(-1)
    : undefined;

  if (schedule.instalments.length === 0 && !schedule.options) {
    return null;
  }

  const options: PlanOption[] = schedule.options
    ? [
        ...(schedule.options.deposit
          ? [
              {
                plan: 'DEPOSIT' as const,
                label: t('deposit', { percent: schedule.options.deposit.percent }),
                text: t('depositText', {
                  amount: money(schedule.options.deposit.amount),
                  balance: money(schedule.options.deposit.balance),
                  date: day(schedule.options.deposit.balanceDueAt),
                }),
              },
            ]
          : []),
        {
          plan: 'FULL' as const,
          label: t('full'),
          text: t('fullText', { amount: money(schedule.options.full.amount) }),
        },
      ]
    : [];

  return (
    <section
      aria-labelledby="pay-title"
      className="flex flex-col items-start gap-4 rounded-lg border border-accent-500 bg-accent-50 p-6"
    >
      <h2 id="pay-title" className="text-h4 text-default">
        {t('title')}
      </h2>

      {schedule.instalments.length === 0 ? (
        locked ? (
          <Alert variant="warning">{t('locked')}</Alert>
        ) : (
          <>
            <p className="text-body-sm text-secondary">{t('choose')}</p>
            <PlanChooser reservationId={reservationId} options={options} />
          </>
        )
      ) : (
        <>
          <p className="text-body-sm text-secondary">
            {t('paidTotal', { paid: money(schedule.paid), total: money(schedule.total) })}
          </p>
          <ul className="flex w-full flex-col divide-y rounded-lg border bg-surface">
            {schedule.instalments.map((instalment) => {
              const overdue =
                instalment.status === 'DUE' && new Date(instalment.dueAt).getTime() < now;
              return (
                <li
                  key={instalment.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-body font-medium text-default">
                      {t(`kinds.${instalment.kind}`)} · {money(instalment.amount)}
                    </span>
                    <span className="text-body-sm text-muted">
                      {instalment.status === 'PAID' && instalment.paidAt
                        ? t('statuses.PAID', { date: day(instalment.paidAt) })
                        : instalment.status === 'DUE'
                          ? t(overdue ? 'statuses.OVERDUE' : 'statuses.DUE', {
                              date: day(instalment.dueAt),
                            })
                          : t(`statuses.${instalment.status}`)}
                    </span>
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
                    {t(`badges.${overdue ? 'OVERDUE' : instalment.status}`)}
                  </Badge>
                </li>
              );
            })}
          </ul>

          {next && payable ? (
            locked ? (
              <Alert variant="warning">{t('locked')}</Alert>
            ) : pending ? (
              <div className="flex w-full flex-col gap-3 rounded-lg border bg-surface p-4">
                <p className="text-body font-medium text-default">
                  {t('pending', { amount: money(pending.amount) })}
                </p>
                {pending.reference ? (
                  <Link
                    href={`/checkout/wire/${pending.reference}`}
                    className="self-start text-body-sm text-primary-600 underline underline-offset-[3px]"
                  >
                    {t('bankDetails')}
                  </Link>
                ) : null}
                <h3 className="text-body-sm font-semibold text-default">
                  {t('proofTitle')}
                </h3>
                {pending.proofs.length > 0 ? (
                  <ul className="flex flex-col gap-1.5">
                    {pending.proofs.map((proof) => (
                      <li key={proof.id} className="flex flex-wrap items-center gap-2">
                        <Badge variant={PROOF_BADGES[proof.status] ?? 'secondary'}>
                          {t(`proofStatuses.${proof.status}`)}
                        </Badge>
                        <span className="text-caption text-muted">
                          {day(proof.createdAt)}
                        </span>
                        {proof.status === 'REJECTED' && proof.reviewNote ? (
                          <span className="text-body-sm text-secondary">
                            {proof.reviewNote}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {pending.proofs.some((proof) => proof.status !== 'REJECTED') ? null : (
                  <ProofUpload reservationId={reservationId} paymentId={pending.id} />
                )}
              </div>
            ) : (
              <PayInstalmentButton
                reservationId={reservationId}
                label={t('pay', { amount: money(next.amount) })}
              />
            )
          ) : null}
        </>
      )}

      {schedule.refunds.length > 0 ? (
        <div className="flex w-full flex-col gap-2">
          <h3 className="text-body-sm font-semibold text-default">{t('refunds')}</h3>
          <ul className="flex flex-col gap-1.5">
            {schedule.refunds.map((refund) => (
              <li
                key={refund.id}
                className="flex flex-wrap items-center gap-2 text-body-sm"
              >
                <span className="font-medium text-default">{money(refund.amount)}</span>
                <span className="text-muted">
                  {refund.status === 'SENT' && refund.sentAt
                    ? t('refundStatuses.SENT', { date: day(refund.sentAt) })
                    : t(`refundStatuses.${refund.status}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

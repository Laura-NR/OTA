'use client';

import type { RefundQuoteDto, RefundReasonDto, ScheduleReceiptDto } from '@ota/schemas';
import { Alert, Button, Field, Input, Select, Textarea } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';
import { moneyExact } from '@/lib/ops-format';

const REASONS: readonly RefundReasonDto[] = [
  'TRAVELER_CANCELLATION',
  'HOST_CANCELLATION',
  'FORCE_MAJEURE',
  'GOODWILL',
  'PRICE_CORRECTION',
];

/**
 * Record a refund request (A-Payments refund queue, M4 D7). "Suggest" asks the
 * API for the cancellation scale's amount (or all that is left for a host
 * cancellation or force majeure); the desk may change it. The reason text is
 * mandatory and goes with the request; approvals follow the manifest limits.
 */
export function RefundForm({
  reservationId,
  receipts,
}: {
  reservationId: string;
  /** The booking's PAID payments. */
  receipts: ScheduleReceiptDto[];
}) {
  const t = useTranslations('backoffice.payments');
  const locale = useLocale();
  const router = useRouter();
  const [receiptId, setReceiptId] = useState(receipts[0]?.id ?? '');
  const [reason, setReason] = useState<RefundReasonDto>('TRAVELER_CANCELLATION');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState<RefundQuoteDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The list can grow after the form mounts (a payment confirmed meanwhile), so
  // the choice falls back to the first receipt rather than a stale empty one.
  const selectedId = receipts.some((candidate) => candidate.id === receiptId)
    ? receiptId
    : (receipts[0]?.id ?? '');
  const receipt = receipts.find((candidate) => candidate.id === selectedId);
  const currency = receipt?.currency ?? 'EUR';

  async function suggest() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<RefundQuoteDto>(
        `/reservations/${reservationId}/refunds/quote?receiptId=${selectedId}&reason=${reason}`,
      );
      setQuote(result);
      setAmount(Number(result.suggested) > 0 ? result.suggested : '');
    } catch (quoteError) {
      setError(quoteError instanceof Error ? quoteError.message : t('actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/reservations/${reservationId}/refunds`, {
        method: 'POST',
        body: JSON.stringify({
          receiptId: selectedId,
          reason,
          note,
          ...(amount ? { amount: Number(amount) } : {}),
        }),
      });
      setAmount('');
      setNote('');
      setQuote(null);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('refundFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (receipts.length === 0) {
    return null;
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border p-4"
      aria-labelledby="refund-form-title"
      onSubmit={onSubmit}
    >
      <h3 id="refund-form-title" className="text-body font-semibold text-default">
        {t('newRefund')}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="refund-receipt" label={t('fromPayment')}>
          {(control) => (
            <Select
              {...control}
              value={selectedId}
              onChange={(event) => {
                setReceiptId(event.target.value);
                setQuote(null);
              }}
            >
              {receipts.map((option) => (
                <option key={option.id} value={option.id}>
                  {t(`rails.${option.rail}`)} ·{' '}
                  {moneyExact(Number(option.amount), option.currency, locale)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="refund-reason" label={t('reason')}>
          {(control) => (
            <Select
              {...control}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value as RefundReasonDto);
                setQuote(null);
              }}
            >
              {REASONS.map((option) => (
                <option key={option} value={option}>
                  {t(`refundReasons.${option}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          id="refund-amount"
          label={t('amountIn', { currency })}
          hint={
            quote?.rule
              ? t('rule', {
                  policy: quote.rule.policyKey,
                  days: quote.rule.daysBefore,
                  keep: quote.rule.keepPercent,
                  fee: moneyExact(quote.rule.fee, currency, locale),
                })
              : undefined
          }
        >
          {(control) => (
            <Input
              {...control}
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          )}
        </Field>
        <div className="flex items-end">
          <Button type="button" variant="secondary" disabled={busy} onClick={suggest}>
            {t('suggest')}
          </Button>
        </div>
      </div>
      <Field id="refund-note" label={t('note')}>
        {(control) => (
          <Textarea
            {...control}
            rows={2}
            minLength={3}
            maxLength={1000}
            required
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </Field>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button
        type="submit"
        className="self-start"
        disabled={busy || note.trim().length < 3}
      >
        {t('requestRefund')}
      </Button>
    </form>
  );
}

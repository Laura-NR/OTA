'use client';

import { PAYOUT_METHODS, workerToday, type PayoutMethod } from '@ota/domain';
import type { PayableJobDto } from '@ota/schemas';
import { Alert, Badge, Button, Checkbox, Field, Input, Select } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState, type FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';
import { moneyExact, opsDayMonth } from '@/lib/ops-format';

export interface SupplierPayoutRecordProps {
  supplierId: string;
  currency: string;
  locale: string;
  /** Finished jobs not yet paid, oldest first. */
  payable: PayableJobDto[];
  /** The worker's method, picked by default. */
  method: PayoutMethod | null;
}

/**
 * "Record payout…" (W-Earnings E1): the desk ticks the jobs it just paid,
 * the method used and the day, and the API sums the amount, settles the jobs
 * and keeps the receipt. Only Operations Admin and Super Admin see it (E7).
 */
export function SupplierPayoutRecord({
  supplierId,
  currency,
  locale,
  payable,
  method,
}: SupplierPayoutRecordProps) {
  const t = useTranslations('backoffice.supplierDetail.payouts');
  const serviceT = useTranslations('status.serviceType');
  const router = useRouter();
  const id = useId();
  const today = workerToday(new Date());
  const [picked, setPicked] = useState<string[]>([]);
  const [paidWith, setPaidWith] = useState<PayoutMethod>(method ?? 'CASH_OFFICE');
  const [paidAt, setPaidAt] = useState(today);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cents, so the total shown is the API's to the cent.
  const totalCents = useMemo(
    () =>
      payable
        .filter((job) => picked.includes(job.serviceItemId))
        .reduce((sum, job) => sum + Math.round(Number(job.payout) * 100), 0),
    [payable, picked],
  );

  if (payable.length === 0) {
    return <p className="text-body-sm text-muted">{t('nothingToPay')}</p>;
  }

  function toggle(serviceItemId: string, checked: boolean) {
    setPicked((current) =>
      checked
        ? [...current, serviceItemId]
        : current.filter((other) => other !== serviceItemId),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/suppliers/${supplierId}/payouts`, {
        method: 'POST',
        body: JSON.stringify({ serviceItemIds: picked, method: paidWith, paidAt }),
      });
      setPicked([]);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('failed'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-body font-semibold">{t('recordTitle')}</legend>
        {payable.map((job) => (
          <Checkbox
            key={job.serviceItemId}
            checked={picked.includes(job.serviceItemId)}
            disabled={pending}
            onChange={(event) => toggle(job.serviceItemId, event.target.checked)}
            label={
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono">
                  {moneyExact(Number(job.payout), currency, locale)}
                </span>
                <span>
                  {[
                    opsDayMonth(job.endsAt, locale),
                    serviceT(job.serviceType),
                    job.province,
                    job.bookingCode,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {job.payoutState === 'ISSUE' ? (
                  <Badge variant="destructive">{t('issue')}</Badge>
                ) : null}
              </span>
            }
          />
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <Field id={`${id}-method`} label={t('paidWith')}>
          {(control) => (
            <Select
              {...control}
              value={paidWith}
              disabled={pending}
              onChange={(event) => setPaidWith(event.target.value as PayoutMethod)}
            >
              {PAYOUT_METHODS.map((option) => (
                <option key={option} value={option}>
                  {t(`methods.${option}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id={`${id}-day`} label={t('paidOn')} required>
          {(control) => (
            <Input
              {...control}
              type="date"
              max={today}
              required
              value={paidAt}
              disabled={pending}
              onChange={(event) => setPaidAt(event.target.value)}
            />
          )}
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || picked.length === 0}>
          {t('record', {
            amount: moneyExact(totalCents / 100, currency, locale),
            count: picked.length,
          })}
        </Button>
        <span className="text-caption text-muted">{t('recordHint')}</span>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </form>
  );
}

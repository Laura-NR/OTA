'use client';

import { PAYOUT_METHODS, type PayoutMethod } from '@ota/domain';
import { Alert, Button, Field, Select } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

export interface SupplierPayoutMethodProps {
  supplierId: string;
  method: PayoutMethod | null;
  /** Operations Admin and Super Admin change it; support reads it. */
  canEdit: boolean;
}

/**
 * How the worker is paid (W-Earnings E2, E3): the desk sets it, the worker
 * app only shows it and asks the worker to call to change it. No bank details
 * are kept here (E3).
 */
export function SupplierPayoutMethod({
  supplierId,
  method,
  canEdit,
}: SupplierPayoutMethodProps) {
  const t = useTranslations('backoffice.supplierDetail.payouts');
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState<string>(method ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/suppliers/${supplierId}/payout-method`, {
        method: 'PUT',
        body: JSON.stringify({ method: value || null }),
      });
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('failed'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <div className="flex flex-wrap items-end gap-3">
        <Field
          id={`${id}-method`}
          label={t('method')}
          className="min-w-0 flex-1 sm:max-w-xs"
        >
          {(control) => (
            <Select
              {...control}
              value={value}
              disabled={!canEdit || pending}
              onChange={(event) => setValue(event.target.value)}
            >
              <option value="">{t('methodNotSet')}</option>
              {PAYOUT_METHODS.map((option) => (
                <option key={option} value={option}>
                  {t(`methods.${option}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {canEdit ? (
          <Button
            type="submit"
            variant="secondary"
            disabled={pending || value === (method ?? '')}
          >
            {t('saveMethod')}
          </Button>
        ) : null}
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </form>
  );
}

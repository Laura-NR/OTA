'use client';

import { credentialsSupersededByVehicle } from '@ota/domain';
import type { PendingVehicleDto } from '@ota/schemas';
import { Alert, Button, Dialog, Field, Textarea } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { apiRequest } from '@/lib/client-api';
import { calendarDate } from '@/lib/ops-format';

/**
 * A vehicle change the worker asked for from the app
 * (`docs/schema-w-vehicle.md` X1a). The current vehicle stays on file until
 * the desk approves; approving a different plate sets aside the inspection
 * and insurance that named the old car (X2a), which the dialog says first.
 * Rejecting needs a reason, which the worker reads in the app.
 */
export function SupplierVehicleRequest({
  supplierId,
  currentPlate,
  request,
  canDecide,
}: {
  supplierId: string;
  /** The plate on file; null when the driver has no vehicle yet. */
  currentPlate: string | null;
  request: PendingVehicleDto;
  /** Operations Admin and Super Admin decide; support reads the request. */
  canDecide: boolean;
}) {
  const t = useTranslations('backoffice.supplierDetail.vehicle.request');
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const setAside = credentialsSupersededByVehicle(currentPlate, request.plate).length > 0;

  async function decide(action: 'approve' | 'reject', body: unknown = {}) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/suppliers/${supplierId}/vehicle/${action}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setOpen(false);
      router.refresh();
    } catch (decideError) {
      setError(decideError instanceof Error ? decideError.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  const line = t('line', {
    model: request.model,
    plate: request.plate,
    seats: request.seats,
    ac: request.airConditioning ? 'yes' : 'no',
  });

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3 rounded-md border border-warning-500 p-4"
    >
      <div className="flex flex-col gap-1">
        <h4 id={`${id}-title`} className="text-body-sm font-semibold text-default">
          {t('title')}
        </h4>
        <p className="text-body-sm text-default">{line}</p>
        <p className="text-caption text-muted">
          {t('asked', { date: calendarDate(request.requestedAt, locale) })}
        </p>
      </div>
      {canDecide ? (
        <>
          <div>
            <Button type="button" size="sm" onClick={() => setOpen(true)}>
              {t('approve')}
            </Button>
          </div>
          <form
            className="flex flex-col gap-2"
            aria-label={t('rejectForm')}
            onSubmit={(event) => {
              event.preventDefault();
              void decide('reject', { reason });
            }}
          >
            <Field
              id={`${id}-reason`}
              label={t('reason')}
              hint={t('reasonHint')}
              required
            >
              {(control) => (
                <Textarea
                  {...control}
                  value={reason}
                  required
                  maxLength={500}
                  rows={2}
                  onChange={(event) => setReason(event.target.value)}
                />
              )}
            </Field>
            <div>
              <Button
                type="submit"
                size="sm"
                variant="destructive"
                disabled={busy || !reason.trim()}
              >
                {t('reject')}
              </Button>
            </div>
          </form>
          {error && !open ? <Alert variant="destructive">{error}</Alert> : null}
        </>
      ) : null}
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title={t('dialogTitle', { model: request.model, plate: request.plate })}
        closeLabel={t('close')}
      >
        {open ? (
          <div className="flex flex-col gap-4">
            <p>{line}</p>
            {setAside ? (
              <Alert variant="warning">
                {t('plateChanges', { from: currentPlate ?? '', to: request.plate })}
              </Alert>
            ) : (
              <p className="text-body-sm text-muted">
                {currentPlate === null ? t('firstVehicle') : t('samePlate')}
              </p>
            )}
            {error ? <Alert variant="destructive">{error}</Alert> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void decide('approve')}
              >
                {t('confirm')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}

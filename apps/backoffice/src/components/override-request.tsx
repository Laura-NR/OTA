'use client';

import type { PermissionCapability } from '@ota/domain';
import { Alert, Button, Dialog, Field, Textarea } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

/** Ask for an override of one row, with a reason (O1, O4). */
export function OverrideRequest({
  capability,
  row,
  hours,
}: {
  capability: PermissionCapability;
  row: string;
  hours: number;
}) {
  const t = useTranslations('backoffice.overrides');
  const why = useTranslations('backoffice.unavailable');
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setError(null);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiRequest('/permission-overrides', {
        method: 'POST',
        body: JSON.stringify({ capability, reason }),
      });
      setOpen(false);
      setReason('');
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {t('request')}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={t('dialogTitle')}
        description={t('dialogDescription', { row, hours })}
        closeLabel={t('close')}
        size="sm"
      >
        {open ? (
          <form className="flex flex-col gap-4" onSubmit={send}>
            <Field
              id={`${id}-reason`}
              label={t('reason')}
              hint={t('reasonHint')}
              required
            >
              {(control) => (
                <Textarea
                  {...control}
                  rows={3}
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              )}
            </Field>
            {error ? <Alert variant="destructive">{error}</Alert> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="tertiary" onClick={close}>
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={busy}
                unavailableReason={
                  reason.trim().length < 3
                    ? why('minLength', { min: 3, field: t('reason') })
                    : undefined
                }
              >
                {t('send')}
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </>
  );
}

/** Give a running override back, or withdraw a pending request (O5). */
export function OverrideEnd({ id, label }: { id: string; label: string }) {
  const t = useTranslations('backoffice.overrides');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function end() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/permission-overrides/${id}/end`, { method: 'POST', body: '{}' });
      router.refresh();
    } catch (endError) {
      setError(endError instanceof Error ? endError.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => void end()}>
        {label}
      </Button>
      {error ? <span className="text-caption text-error-700">{error}</span> : null}
    </div>
  );
}

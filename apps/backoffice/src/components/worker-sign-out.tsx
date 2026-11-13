'use client';

import type { WorkerSignOutDto } from '@ota/schemas';
import { Alert, Button, Dialog } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

/**
 * "Sign out of the worker app…", for a lost phone or one that changed hands:
 * every phone signed in as the worker goes back to sign-in at its next
 * connection, and any code not yet used stops working.
 */
export function WorkerSignOut({
  supplierId,
  name,
}: {
  supplierId: string;
  name: string;
}) {
  const t = useTranslations('backoffice.supplierDetail.signInCode');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState<WorkerSignOutDto | null>(null);

  function close() {
    setOpen(false);
    setError(null);
    setEnded(null);
  }

  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      setEnded(
        await apiRequest<WorkerSignOutDto>(`/suppliers/${supplierId}/worker-sign-out`, {
          method: 'POST',
        }),
      );
    } catch (signOutError) {
      setError(
        signOutError instanceof Error ? signOutError.message : t('signOut.failed'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        {t('signOut.open')}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={t('signOut.dialogTitle', { name })}
        closeLabel={t('close')}
      >
        {!open ? null : ended ? (
          <div className="flex flex-col gap-4">
            <Alert variant="success">
              {ended.sessions > 0
                ? t('signOut.ended', { count: ended.sessions, name })
                : t('signOut.none', { name })}
            </Alert>
            <div className="flex justify-end">
              <Button onClick={close}>{t('done')}</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p>{t('signOut.explain', { name })}</p>
            {error ? <Alert variant="destructive">{error}</Alert> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>
                {t('cancel')}
              </Button>
              <Button type="button" disabled={busy} onClick={() => void signOut()}>
                {t('signOut.confirm')}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

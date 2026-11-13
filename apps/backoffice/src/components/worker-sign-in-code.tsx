'use client';

import type { WorkerSignInCodeDto } from '@ota/schemas';
import { Alert, Button, Dialog } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';
import { opsTime } from '@/lib/ops-format';

/**
 * "Issue sign-in code…" (`docs/worker-app-plan.md` W1, W-Login "¿Sin señal
 * para el SMS?"): a reminder to check the worker's ID card, then the code,
 * shown once, to read out by phone or at the desk. Closing the dialog forgets
 * it.
 */
export function WorkerSignInCode({
  supplierId,
  name,
}: {
  supplierId: string;
  name: string;
}) {
  const t = useTranslations('backoffice.supplierDetail.signInCode');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<WorkerSignInCodeDto | null>(null);

  function close() {
    setOpen(false);
    setError(null);
    setIssued(null);
  }

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      setIssued(
        await apiRequest<WorkerSignInCodeDto>(`/suppliers/${supplierId}/sign-in-code`, {
          method: 'POST',
        }),
      );
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : t('failed'));
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
        {t('issue')}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={t('dialogTitle', { name })}
        closeLabel={t('close')}
      >
        {!open ? null : issued ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 rounded-md border bg-page p-4">
              <span className="text-caption text-secondary">{t('codeLabel')}</span>
              <code className="font-mono text-h3 tracking-wider text-default">
                {issued.code}
              </code>
            </div>
            <p>
              {t('read', {
                name,
                phone: issued.phone,
                time: opsTime(issued.expiresAt, locale),
              })}
            </p>
            <div className="flex justify-end">
              <Button onClick={close}>{t('done')}</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Alert variant="warning">{t('check', { name })}</Alert>
            {error ? <Alert variant="destructive">{error}</Alert> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>
                {t('cancel')}
              </Button>
              <Button type="button" disabled={busy} onClick={() => void issue()}>
                {t('confirm')}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

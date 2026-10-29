'use client';

import { Button, Dialog } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Withdraw an event request the desk has not confirmed yet (M10 D3). It cannot
 * be reopened, so it asks first, saying so (DS 02: destructive actions confirm).
 */
export function CancelEventRequest({ id }: { id: string }) {
  const t = useTranslations('events.mine');
  const common = useTranslations('pages.common');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function cancel() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/ota/me/event-requests/${id}/cancel`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="tertiary"
        size="sm"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        {t('withdraw')}
      </Button>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('withdrawTitle')}
        description={t('withdrawText')}
        closeLabel={common('close')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t('withdrawKeep')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                void cancel();
              }}
            >
              {t('withdrawConfirm')}
            </Button>
          </>
        }
      />
      {failed ? (
        <span role="alert" className="text-caption text-error-600">
          {t('withdrawFailed')}
        </span>
      ) : null}
    </div>
  );
}

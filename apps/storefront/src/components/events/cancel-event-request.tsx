'use client';

import { Button } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Withdraw an event request the desk has not confirmed yet (M10 D3). */
export function CancelEventRequest({ id }: { id: string }) {
  const t = useTranslations('events.mine');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

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
    <span className="flex flex-wrap items-center gap-2">
      <Button variant="tertiary" size="sm" disabled={busy} onClick={() => void cancel()}>
        {t('withdraw')}
      </Button>
      {failed ? (
        <span role="alert" className="text-caption text-error-600">
          {t('withdrawFailed')}
        </span>
      ) : null}
    </span>
  );
}

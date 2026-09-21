'use client';

import { Alert, Button } from '@ota/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

export function StartDispatchButton({
  reservationId,
  canManage,
}: {
  reservationId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) {
    return null;
  }

  return (
    <div className="space-y-2">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await apiRequest(`/reservations/${reservationId}/dispatch`, {
              method: 'POST',
            });
            router.refresh();
          } catch (dispatchError) {
            setError(
              dispatchError instanceof Error ? dispatchError.message : 'Dispatch failed',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Dispatching…' : 'Start dispatch'}
      </Button>
    </div>
  );
}

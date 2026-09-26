'use client';

import { Alert, Button } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

export function RegenerateDocumentsButton({
  reservationId,
  canManage,
}: {
  reservationId: string;
  canManage: boolean;
}) {
  const t = useTranslations('backoffice.documentsControls');
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
            await apiRequest(`/reservations/${reservationId}/documents`, {
              method: 'POST',
            });
            router.refresh();
          } catch (generateError) {
            setError(
              generateError instanceof Error ? generateError.message : t('failed'),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t('generating') : t('regenerate')}
      </Button>
    </div>
  );
}

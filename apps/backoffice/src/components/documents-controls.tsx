'use client';

import { Alert, Button } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useDeskTelemetry } from '@/components/telemetry/desk-telemetry';
import { apiRequest } from '@/lib/client-api';

export function RegenerateDocumentsButton({
  reservationId,
  bookingCode,
  canManage,
}: {
  reservationId: string;
  /** For T-Events; null when the picked booking is not in the list. */
  bookingCode: string | null;
  canManage: boolean;
}) {
  const t = useTranslations('backoffice.documentsControls');
  const track = useDeskTelemetry();
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
            track('document_generated', {
              ...(bookingCode ? { booking_code: bookingCode } : {}),
              trigger: 'manual',
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

'use client';

import { nextStatuses } from '@ota/domain';
import type { ReservationStatus } from '@ota/domain';
import { Alert, Button } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

export interface ReservationActionsProps {
  reservationId: string;
  status: ReservationStatus;
  canManage: boolean;
}

/** The legal transitions for the current status, as one-click actions. */
export function ReservationActions({
  reservationId,
  status,
  canManage,
}: ReservationActionsProps) {
  const t = useTranslations('backoffice.reservationActions');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = nextStatuses(status);

  if (!canManage) {
    return <p className="text-sm text-muted-foreground">{t('viewOnly')}</p>;
  }

  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('terminal')}</p>;
  }

  async function transition(to: ReservationStatus) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/reservations/${reservationId}/transition`, {
        method: 'POST',
        body: JSON.stringify({ to }),
      });
      router.refresh();
    } catch (transitionError) {
      setError(transitionError instanceof Error ? transitionError.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {options.map((to) => (
          <Button
            key={to}
            size="sm"
            variant={to === 'CANCELLED' ? 'destructive' : 'outline'}
            disabled={busy}
            onClick={() => transition(to)}
          >
            {to.replaceAll('_', ' ')}
          </Button>
        ))}
      </div>
    </div>
  );
}

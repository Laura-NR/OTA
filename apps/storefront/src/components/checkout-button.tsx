'use client';

import { Alert, Button } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * Starts a payment for the traveler's own secured booking (spec §7.1). It only
 * creates the link and follows it; confirmation stays an operations action, so
 * there is no self-confirm path (ADR 0003).
 */
export function CheckoutButton({ reservationId }: { reservationId: string }) {
  const t = useTranslations('checkout');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/ota/me/reservations/${reservationId}/payments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rail: 'OPEN_BANKING_SEPA' }),
      });
      if (!response.ok) {
        throw new Error(t('error'));
      }
      const intent = (await response.json()) as { checkoutUrl: string };
      window.location.href = intent.checkoutUrl;
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : t('error'));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button onClick={start} disabled={busy}>
        {busy ? t('creating') : t('pay')}
      </Button>
    </div>
  );
}

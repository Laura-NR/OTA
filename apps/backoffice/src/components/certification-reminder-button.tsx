'use client';

import { Button } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

type SendState = 'idle' | 'sending' | 'sent' | 'failed';

/**
 * A-Customers "Send certification reminder" (Phase 6): asks the API to email
 * the E-OFAC reminder for one trip. The send is audited server-side.
 */
export function CertificationReminderButton({
  customerId,
  reservationId,
}: {
  customerId: string;
  reservationId: string;
}) {
  const t = useTranslations('backoffice.customers.reminder');
  const [state, setState] = useState<SendState>('idle');

  async function send() {
    setState('sending');
    try {
      await apiRequest(`/customers/${customerId}/certification-reminder`, {
        method: 'POST',
        body: JSON.stringify({ reservationId }),
      });
      setState('sent');
    } catch {
      setState('failed');
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        variant="tertiary"
        disabled={state === 'sending' || state === 'sent'}
        onClick={send}
      >
        {state === 'sent' ? t('sent') : state === 'sending' ? t('sending') : t('send')}
      </Button>
      {state === 'failed' ? (
        <span className="text-caption text-error-700">{t('failed')}</span>
      ) : null}
    </div>
  );
}

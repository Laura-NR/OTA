'use client';

import { Alert, Button } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useRouter } from '@/i18n/navigation';

/**
 * M5: accept or decline the current proposal version. Accepting creates the
 * booking request and is the only write; nothing is charged.
 */
export function ProposalActions({
  proposalId,
  versionId,
}: {
  proposalId: string;
  versionId: string;
}) {
  const t = useTranslations('proposal');
  const router = useRouter();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(action: 'accept' | 'decline') {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(`/api/ota/me/proposals/${proposalId}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action === 'accept' ? { versionId } : {}),
      });
      if (!response.ok) {
        throw new Error(t('failed'));
      }
      if (action === 'accept') {
        const body = (await response.json()) as { reservationId: string };
        router.push(`/account/reservations/${body.reservationId}`);
      } else {
        router.refresh();
      }
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t('failed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button size="lg" disabled={busy !== null} onClick={() => send('accept')}>
          {busy === 'accept' ? t('accepting') : t('accept')}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => send('decline')}
        >
          {busy === 'decline' ? t('declining') : t('decline')}
        </Button>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}

'use client';

import { Alert, Button } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

/** Approve (creates the account + profile) or reject a recruitment application. */
export function ApplicationActions({
  applicationId,
  status,
  canReview,
}: {
  applicationId: string;
  status: string;
  canReview: boolean;
}) {
  const t = useTranslations('backoffice.applicationActions');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canReview || status !== 'PENDING') {
    return null;
  }

  async function review(action: 'approve' | 'reject') {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/supplier-applications/${applicationId}/${action}`, {
        method: 'POST',
      });
      router.refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => review('approve')}>
          {t('approve')}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => review('reject')}
        >
          {t('reject')}
        </Button>
      </div>
    </div>
  );
}

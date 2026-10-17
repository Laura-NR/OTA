'use client';

import type { ProofSummaryDto } from '@ota/schemas';
import { Alert, Badge, Button, Input, type BadgeVariant } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest, browserApiUrl } from '@/lib/client-api';

const VARIANTS: Record<ProofSummaryDto['status'], BadgeVariant> = {
  SUBMITTED: 'warning',
  ACCEPTED: 'info',
  REJECTED: 'destructive',
};

/**
 * A-Payments "Review proof" (M4 D5): open the traveler's proof (the read is
 * logged), accept it, which gives the window one more business day, or reject
 * it with a note the traveler sees. The receipt is still confirmed by hand
 * once the money is in the account.
 */
export function ProofReview({
  proof,
  canManage,
}: {
  proof: Pick<ProofSummaryDto, 'id' | 'status' | 'reviewNote'>;
  canManage: boolean;
}) {
  const t = useTranslations('backoffice.payments');
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(action: 'accept' | 'reject') {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/payments/proofs/${proof.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify(action === 'reject' ? { note } : {}),
      });
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={VARIANTS[proof.status]}>
          {t(`proofStatuses.${proof.status}`)}
        </Badge>
        <a
          href={browserApiUrl(`/payments/proofs/${proof.id}/file`)}
          target="_blank"
          rel="noreferrer"
          className="text-body-sm text-primary-600 underline underline-offset-[3px]"
        >
          {t('viewProof')}
        </a>
        {proof.status === 'REJECTED' && proof.reviewNote ? (
          <span className="text-body-sm text-secondary">{proof.reviewNote}</span>
        ) : null}
      </div>
      {canManage && proof.status === 'SUBMITTED' ? (
        rejecting ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send('reject');
            }}
          >
            <Input
              aria-label={t('rejectNote')}
              placeholder={t('rejectNote')}
              value={note}
              maxLength={500}
              required
              onChange={(event) => setNote(event.target.value)}
              className="min-w-0 flex-1 sm:max-w-[360px]"
            />
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              disabled={busy || !note.trim()}
            >
              {t('rejectSend')}
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => send('accept')}>
              {t('acceptProof')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => setRejecting(true)}
            >
              {t('rejectProof')}
            </Button>
          </div>
        )
      ) : null}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}

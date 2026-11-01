'use client';

import type { RefundDto } from '@ota/schemas';
import { Alert, Badge, Button, Input, type BadgeVariant } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useDeskTelemetry } from '@/components/telemetry/desk-telemetry';
import { apiRequest } from '@/lib/client-api';

/** The actions that decide an approval (T-Events `approval_decided`). */
const DECISIONS: Readonly<Record<string, 'approved' | 'rejected'>> = {
  approve: 'approved',
  reject: 'rejected',
};

const VARIANTS: Record<RefundDto['status'], BadgeVariant> = {
  REQUESTED: 'warning',
  APPROVED: 'info',
  REJECTED: 'secondary',
  SENT: 'success',
  FAILED: 'destructive',
};

/**
 * One refund's approval state and actions (A-Payments refund queue, M4 D7):
 * approve or reject by the manifest's limits, and record the bank reference
 * once an approved transfer refund has gone out. A card refund is sent through
 * the gateway as soon as it is approved. A permission override never votes
 * (`docs/schema-m9-permission-overrides.md` O3), so `canVote` can be narrower.
 */
export function RefundActions({
  refund,
  canManage,
  canVote = canManage,
}: {
  refund: RefundDto;
  canManage: boolean;
  canVote?: boolean;
}) {
  const t = useTranslations('backoffice.payments');
  const why = useTranslations('backoffice.unavailable');
  const router = useRouter();
  const track = useDeskTelemetry();
  const [mode, setMode] = useState<'idle' | 'reject' | 'sent'>('idle');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/refunds/${refund.id}/${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const decision = DECISIONS[path];
      if (decision) {
        track('approval_decided', { kind: 'refund', decision });
      }
      setMode('idle');
      setText('');
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  const pending = refund.decision.state === 'PENDING' ? refund.decision : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={VARIANTS[refund.status]}>
          {t(`refundStatuses.${refund.status}`)}
        </Badge>
        {refund.status === 'REQUESTED' && pending ? (
          <span className="text-caption text-muted">
            {pending.superAdmin
              ? t('needsSuper')
              : t('needsApprovals', { count: pending.missing })}
          </span>
        ) : null}
        {refund.providerRefundId ? (
          <span className="font-mono text-caption text-muted">
            {refund.providerRefundId}
          </span>
        ) : null}
      </div>
      {canVote && refund.status === 'REQUESTED' && mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => post('approve', {})}>
            {t('approve')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => setMode('reject')}
          >
            {t('reject')}
          </Button>
        </div>
      ) : null}
      {canManage &&
      refund.status === 'APPROVED' &&
      refund.rail !== 'CARD' &&
      mode === 'idle' ? (
        <Button
          size="sm"
          className="self-start"
          disabled={busy}
          onClick={() => setMode('sent')}
        >
          {t('markSent')}
        </Button>
      ) : null}
      {mode !== 'idle' ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void (mode === 'reject'
              ? post('reject', { note: text })
              : post('sent', { reference: text }));
          }}
        >
          <Input
            aria-label={mode === 'reject' ? t('rejectReason') : t('bankReference')}
            placeholder={mode === 'reject' ? t('rejectReason') : t('bankReference')}
            value={text}
            maxLength={mode === 'reject' ? 500 : 100}
            required
            onChange={(event) => setText(event.target.value)}
            className="min-w-0 flex-1 sm:max-w-[280px]"
          />
          <Button
            type="submit"
            size="sm"
            variant={mode === 'reject' ? 'destructive' : 'primary'}
            disabled={busy}
            unavailableReason={
              text.trim()
                ? undefined
                : why('fillIn', {
                    field: mode === 'reject' ? t('rejectReason') : t('bankReference'),
                  })
            }
          >
            {mode === 'reject' ? t('reject') : t('markSent')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="tertiary"
            onClick={() => setMode('idle')}
          >
            {t('cancel')}
          </Button>
        </form>
      ) : null}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}

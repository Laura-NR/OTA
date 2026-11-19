'use client';

import { REFUND_NUDGE_COOLDOWN_MINUTES } from '@ota/domain';
import type { RefundDto, RefundNudgeResultDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Input,
  type BadgeVariant,
  type ButtonSize,
} from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useDeskTelemetry } from '@/components/telemetry/desk-telemetry';
import { apiRequest } from '@/lib/client-api';
import { moneyExact, opsTime } from '@/lib/ops-format';

/** The actions that decide an approval (T-Events `approval_decided`). */
const DECISIONS: Readonly<Record<string, 'approved' | 'rejected'>> = {
  approve: 'approved',
  reject: 'rejected',
};

/** Beyond this many, a nudge's confirmation counts the approvers instead of naming them. */
const NAMED_RECIPIENTS = 3;

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
 * Once the viewer has approved a refund that still waits (AL-Alerts), they
 * may nudge the approvers left by email or withdraw their approval instead.
 * Ops Lite asks for `md` buttons, the phone's touch size.
 */
export function RefundActions({
  refund,
  canManage,
  canVote = canManage,
  viewerEmail,
  size = 'sm',
}: {
  refund: RefundDto;
  canManage: boolean;
  canVote?: boolean;
  /** The signed-in person, to tell their own approval apart. */
  viewerEmail?: string;
  size?: ButtonSize;
}) {
  const t = useTranslations('backoffice.payments');
  const why = useTranslations('backoffice.unavailable');
  const locale = useLocale();
  const router = useRouter();
  const track = useDeskTelemetry();
  const [mode, setMode] = useState<'idle' | 'reject' | 'sent'>('idle');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudged, setNudged] = useState<RefundNudgeResultDto | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

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
      setConfirmWithdraw(false);
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function nudge() {
    setBusy(true);
    setError(null);
    try {
      setNudged(
        await apiRequest<RefundNudgeResultDto>(`/refunds/${refund.id}/nudge`, {
          method: 'POST',
        }),
      );
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  const pending = refund.decision.state === 'PENDING' ? refund.decision : null;
  const viewer = viewerEmail?.toLowerCase();
  const approvedByViewer =
    viewer !== undefined &&
    refund.approvals.some(
      (approval) => approval.approve && approval.approverEmail?.toLowerCase() === viewer,
    );
  const lastNudgedAt = nudged?.nudgedAt ?? refund.lastNudgedAt ?? null;
  const nextNudgeAt = lastNudgedAt
    ? new Date(new Date(lastNudgedAt).getTime() + REFUND_NUDGE_COOLDOWN_MINUTES * 60_000)
    : null;
  const nudgeWait =
    nextNudgeAt && nextNudgeAt.getTime() > Date.now()
      ? t('nudgeWait', { time: opsTime(nextNudgeAt, locale) })
      : undefined;

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
      {canVote && refund.status === 'REQUESTED' && approvedByViewer && pending ? (
        <div className="flex flex-col gap-2">
          <p className="text-caption text-muted">
            {pending.superAdmin ? t('youApprovedSuper') : t('youApprovedAnother')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size={size}
              disabled={busy}
              unavailableReason={nudgeWait}
              onClick={() => void nudge()}
            >
              {t('nudge')}
            </Button>
            <Button
              size={size}
              variant="tertiary"
              disabled={busy}
              onClick={() => setConfirmWithdraw(true)}
            >
              {t('withdraw')}
            </Button>
          </div>
          {nudged ? (
            <Alert variant="success">
              {nudged.recipients.length > NAMED_RECIPIENTS
                ? t('nudgedMany', {
                    count: nudged.recipients.length,
                    time: opsTime(nudged.nudgedAt, locale),
                  })
                : t('nudged', {
                    names: new Intl.ListFormat(locale, {
                      style: 'long',
                      type: 'conjunction',
                    }).format(nudged.recipients),
                    time: opsTime(nudged.nudgedAt, locale),
                  })}
            </Alert>
          ) : lastNudgedAt && !nudgeWait ? (
            <p className="text-caption text-muted">
              {t('lastNudged', { time: opsTime(lastNudgedAt, locale) })}
            </p>
          ) : null}
          <Dialog
            open={confirmWithdraw}
            onClose={() => setConfirmWithdraw(false)}
            title={t('withdrawTitle')}
            closeLabel={t('close')}
            size="sm"
            footer={
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirmWithdraw(false)}
                >
                  {t('cancel')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  loading={busy}
                  onClick={() => void post('withdraw', {})}
                >
                  {t('withdrawConfirm')}
                </Button>
              </>
            }
          >
            <p>
              {t('withdrawExplain', {
                amount: moneyExact(Number(refund.amount), refund.currency, locale),
                code: refund.bookingCode,
              })}
            </p>
          </Dialog>
        </div>
      ) : null}
      {canVote &&
      refund.status === 'REQUESTED' &&
      !approvedByViewer &&
      mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          <Button size={size} disabled={busy} onClick={() => post('approve', {})}>
            {t('approve')}
          </Button>
          <Button
            size={size}
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
          size={size}
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
            size={size}
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
            size={size}
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

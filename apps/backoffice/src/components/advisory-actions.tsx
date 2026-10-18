'use client';

import type { AdvisoryDto } from '@ota/schemas';
import { Alert, Button, Input } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

/**
 * A-Content's approval panel actions (M7 D4): approve (and publish when the
 * rule is met), request changes back to draft, open a new version of a
 * published advisory, and lift or unschedule one.
 */
export function AdvisoryActions({
  advisory,
  actorId,
}: {
  advisory: AdvisoryDto;
  /** The signed-in desk member, so their own approval is not offered twice. */
  actorId: string;
}) {
  const t = useTranslations('advisoriesDesk');
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'changes' | 'lift'>('idle');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body: unknown, then?: (result: AdvisoryDto) => void) {
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<AdvisoryDto>(`/advisories/${advisory.id}/${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMode('idle');
      setNote('');
      if (then) {
        then(result);
      } else {
        router.refresh();
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : t('approval.actionFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  const open = advisory.status === 'DRAFT' || advisory.status === 'IN_REVIEW';
  const approvedByMe = advisory.approvals.some(
    (approval) => approval.approverId === actorId,
  );
  const approveLabel =
    advisory.severity !== 'CRITICAL'
      ? t('approval.approvePublish')
      : advisory.approvals.length === 0
        ? t('approval.approveFirst')
        : t('approval.approveSecond');
  // Only the approval that publishes needs every translation (D6).
  const publishes = advisory.severity !== 'CRITICAL' || advisory.approvals.length > 0;
  const live =
    advisory.displayStatus === 'PUBLISHED' || advisory.displayStatus === 'SCHEDULED';

  return (
    <div className="flex flex-col gap-3">
      {open && mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={
              busy ||
              approvedByMe ||
              (publishes && advisory.missingTranslations.length > 0)
            }
            onClick={() => post('approve', {})}
          >
            {approveLabel}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setMode('changes')}>
            {t('approval.requestChanges')}
          </Button>
        </div>
      ) : null}

      {advisory.status === 'PUBLISHED' && mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              post('versions', {}, (version) =>
                router.push(`/content/advisories/${version.id}`),
              )
            }
          >
            {advisory.supersededById ? t('live.openVersion') : t('live.newVersion')}
          </Button>
          {live ? (
            <Button variant="destructive" disabled={busy} onClick={() => setMode('lift')}>
              {advisory.displayStatus === 'SCHEDULED'
                ? t('live.unschedule')
                : t('live.lift')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {mode !== 'idle' ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void (mode === 'changes'
              ? post('request-changes', { note })
              : post('lift', note.trim() ? { note } : {}));
          }}
        >
          <Input
            aria-label={
              mode === 'changes' ? t('approval.changesNote') : t('live.liftNote')
            }
            placeholder={
              mode === 'changes' ? t('approval.changesNote') : t('live.liftNote')
            }
            value={note}
            maxLength={500}
            required={mode === 'changes'}
            onChange={(event) => setNote(event.target.value)}
            className="min-w-0 flex-1 sm:max-w-[320px]"
          />
          <Button
            type="submit"
            variant={mode === 'lift' ? 'destructive' : 'primary'}
            disabled={busy || (mode === 'changes' && !note.trim())}
          >
            {mode === 'changes' ? t('approval.sendBack') : t('live.confirmLift')}
          </Button>
          <Button type="button" variant="tertiary" onClick={() => setMode('idle')}>
            {t('approval.cancel')}
          </Button>
        </form>
      ) : null}

      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}

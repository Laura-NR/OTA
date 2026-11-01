'use client';

import { Button, Input } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { apiRequest } from '@/lib/client-api';

/**
 * A Super Admin's decision on an override (`docs/schema-m9-permission-overrides.md`
 * O4, O5): approve or decline a pending request, or end a running override,
 * with an optional note.
 */
export function OverrideDecision({
  id,
  name,
  mode,
}: {
  id: string;
  /** Whose override, for the controls' accessible names. */
  name: string;
  mode: 'request' | 'active';
}) {
  const t = useTranslations('backoffice.settings.permissions');
  const router = useRouter();
  const noteId = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(step: 'approve' | 'decline' | 'end') {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/permission-overrides/${id}/${step}`, {
        method: 'POST',
        body: JSON.stringify(note.trim() ? { note: note.trim() } : {}),
      });
      router.refresh();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        id={noteId}
        aria-label={t('noteFor', { name })}
        placeholder={t('decisionNote')}
        maxLength={500}
        value={note}
        disabled={busy}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {mode === 'request' ? (
          <>
            <Button
              size="sm"
              disabled={busy}
              aria-label={t('approveFor', { name })}
              onClick={() => void decide('approve')}
            >
              {t('approve')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              aria-label={t('declineFor', { name })}
              onClick={() => void decide('decline')}
            >
              {t('decline')}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            aria-label={t('endFor', { name })}
            onClick={() => void decide('end')}
          >
            {t('end')}
          </Button>
        )}
      </div>
      {error ? <span className="text-caption text-error-700">{error}</span> : null}
    </div>
  );
}

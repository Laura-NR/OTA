'use client';

import type { EventDto } from '@ota/schemas';
import { Alert, Button } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

/**
 * Publish, archive or delete an event (M10 D1). Publishing runs the publish
 * checks first; an event that requests point at is archived, never deleted.
 */
export function EventActions({ event }: { event: EventDto }) {
  const t = useTranslations('eventsDesk');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: 'publish' | 'archive' | 'delete') {
    setBusy(true);
    setError(null);
    try {
      if (action === 'delete') {
        await apiRequest<void>(`/events/${event.id}`, { method: 'DELETE' });
        router.push('/content/events');
        return;
      }
      await apiRequest<EventDto>(`/events/${event.id}/${action}`, {
        method: 'POST',
        body: '{}',
      });
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('actions.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {event.status !== 'PUBLISHED' ? (
          <Button
            disabled={busy || event.publishIssues.length > 0}
            onClick={() => void run('publish')}
          >
            {t('actions.publish')}
          </Button>
        ) : null}
        {event.status !== 'ARCHIVED' ? (
          <Button variant="secondary" disabled={busy} onClick={() => void run('archive')}>
            {t('actions.archive')}
          </Button>
        ) : null}
        {event.requestCount === 0 ? (
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => void run('delete')}
          >
            {t('actions.delete')}
          </Button>
        ) : null}
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}

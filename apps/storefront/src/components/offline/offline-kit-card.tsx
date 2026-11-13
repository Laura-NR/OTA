'use client';

import { offlineKitMissingDocuments, type OfflineKitEntry } from '@ota/domain';
import { Alert, Button } from '@ota/ui';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import {
  offlineKitSupported,
  readOfflineKit,
  removeOfflineKit,
  saveOfflineKit,
} from '@/lib/offline-kit';

type State = 'ready' | 'saving' | 'failed' | 'unsupported';

/** "2.3 MB", or kilobytes under one megabyte. */
function size(bytes: number, locale: string): string {
  const megabytes = bytes / 1_000_000;
  return megabytes >= 1
    ? new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: 'megabyte',
        maximumFractionDigits: 1,
      }).format(megabytes)
    : new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: 'kilobyte',
        maximumFractionDigits: 0,
      }).format(Math.max(1, bytes / 1000));
}

/**
 * The trip's offline kit (Account board "Documents & offline kit"): saves
 * this page and its documents on the device when the traveler asks, says
 * what was saved and when, and offers to update it once a new document is
 * issued. What it shows depends on this browser's storage, so the server
 * renders the unsaved state and the browser fills in the rest.
 */
export function OfflineKitCard({
  reservationId,
  bookingCode,
  documentIds,
}: {
  reservationId: string;
  bookingCode: string;
  documentIds: string[];
}) {
  const t = useTranslations('offline.kit');
  const format = useFormatter();
  const locale = useLocale();
  const [entry, setEntry] = useState<OfflineKitEntry | null>(null);
  const [state, setState] = useState<State>('ready');

  useEffect(() => {
    if (!offlineKitSupported()) {
      setState('unsupported');
      return;
    }
    readOfflineKit(reservationId)
      .then(setEntry)
      .catch(() => {});
  }, [reservationId]);

  async function save() {
    setState('saving');
    try {
      setEntry(
        await saveOfflineKit({
          reservationId,
          bookingCode,
          pagePath: window.location.pathname,
          documentIds,
        }),
      );
      setState('ready');
    } catch {
      setState('failed');
    }
  }

  async function remove() {
    await removeOfflineKit(reservationId).catch(() => {});
    setEntry(null);
  }

  const missing = entry ? offlineKitMissingDocuments(entry, documentIds).length : 0;

  return (
    <section
      id="offline-kit"
      aria-labelledby="offline-kit-title"
      className="flex flex-col gap-4 rounded-lg border bg-surface p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="offline-kit-title" className="text-h4 text-default">
          {t('title')}
        </h2>
        <p className="text-body-sm text-secondary">{t('lede')}</p>
      </div>
      {state === 'unsupported' ? (
        <Alert>{t('unsupported')}</Alert>
      ) : (
        <>
          <p className="text-body font-semibold text-default" aria-live="polite">
            {state === 'saving'
              ? t('saving')
              : entry
                ? t('saved', {
                    date: format.dateTime(new Date(entry.savedAt), {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                    size: size(entry.bytes, locale),
                  })
                : t('contents', { count: documentIds.length })}
          </p>
          {missing > 0 ? (
            <Alert variant="warning">{t('missing', { count: missing })}</Alert>
          ) : null}
          {state === 'failed' ? <Alert variant="destructive">{t('failed')}</Alert> : null}
          <div className="flex flex-wrap gap-3">
            <Button onClick={save} disabled={state === 'saving'}>
              {entry ? t('update') : t('save')}
            </Button>
            {entry ? (
              <Button variant="secondary" onClick={remove} disabled={state === 'saving'}>
                {t('remove')}
              </Button>
            ) : null}
          </div>
          <p className="text-caption text-muted">{t('privacy')}</p>
        </>
      )}
    </section>
  );
}

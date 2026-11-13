'use client';

import type { OfflineKitEntry } from '@ota/domain';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { offlineKitSupported, readOfflineKits } from '@/lib/offline-kit';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** "2 hours ago" for an instant in the past, in the page's language. */
function age(savedAt: string, locale: string): string {
  const minutes = Math.round((Date.now() - Date.parse(savedAt)) / 60_000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(minutes) < 60) {
    return format.format(-minutes, 'minute');
  }
  const hours = Math.round(minutes / 60);
  return Math.abs(hours) < 24
    ? format.format(-hours, 'hour')
    : format.format(-Math.round(hours / 24), 'day');
}

/**
 * The offline pill (DS 05 "Offline": dark, at the top, status + what still
 * works). On a saved trip it says how old the saved copy is. It renders only
 * in the browser, so it never differs from the server's HTML.
 */
export function OfflinePill() {
  const t = useTranslations('offline');
  const locale = useLocale();
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const [saved, setSaved] = useState<OfflineKitEntry | null>(null);

  useEffect(() => {
    if (online || !offlineKitSupported()) {
      setSaved(null);
      return;
    }
    let current = true;
    readOfflineKits()
      .then((kits) => {
        if (current) {
          setSaved(kits.find((kit) => kit.pagePath === window.location.pathname) ?? null);
        }
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [online]);

  if (online) {
    return null;
  }
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-2 z-50 flex justify-center px-4"
    >
      <p className="pointer-events-auto max-w-full rounded-full bg-neutral-900 px-4 py-2 text-center text-body-sm text-neutral-0 shadow-md">
        {saved ? t('pillSaved', { age: age(saved.savedAt, locale) }) : t('pill')}
      </p>
    </div>
  );
}

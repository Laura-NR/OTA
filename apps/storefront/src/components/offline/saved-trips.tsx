'use client';

import type { OfflineKitEntry } from '@ota/domain';
import { Button } from '@ota/ui';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { offlineKitSupported, readOfflineKits } from '@/lib/offline-kit';

/**
 * The trips saved on this device, read from the offline kit. The links are
 * plain anchors: offline, the service worker answers the navigation from the
 * kit, which the client router's data request cannot reach.
 */
export function SavedTrips() {
  const t = useTranslations('offline');
  const format = useFormatter();
  const [kits, setKits] = useState<OfflineKitEntry[] | null>(null);

  useEffect(() => {
    if (!offlineKitSupported()) {
      setKits([]);
      return;
    }
    readOfflineKits()
      .then(setKits)
      .catch(() => setKits([]));
  }, []);

  if (kits === null) {
    return null;
  }
  if (kits.length === 0) {
    return <p className="max-w-prose text-body text-secondary">{t('savedEmpty')}</p>;
  }
  return (
    <ul className="flex flex-col divide-y rounded-lg border bg-surface">
      {kits.map((kit) => (
        <li
          key={kit.reservationId}
          className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4"
        >
          <a
            href={kit.pagePath}
            className="font-mono font-semibold text-primary-600 underline underline-offset-[3px]"
          >
            {t('openTrip', { code: kit.bookingCode })}
          </a>
          <span className="text-body-sm text-muted">
            {format.dateTime(new Date(kit.savedAt), {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RetryButton({ label }: { label: string }) {
  return (
    <Button className="self-start" onClick={() => window.location.reload()}>
      {label}
    </Button>
  );
}

'use client';

import { Tag } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { opsDate, opsOffset, opsTime } from '@/lib/ops-format';

/**
 * The desk's clock in the dashboard header: today and the time in Havana, with
 * the zone's offset ("Tue 6 Oct 2026 · 14:32 Havana (UTC−4)").
 */
export function OpsClock({ serverNow }: { serverNow: number }) {
  const t = useTranslations('backoffice.dashboard');
  const locale = useLocale();
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const at = new Date(now);
  return (
    <Tag className="font-mono">
      {t('clock', {
        date: opsDate(at, locale),
        time: opsTime(at, locale),
        offset: opsOffset(at),
      })}
    </Tag>
  );
}

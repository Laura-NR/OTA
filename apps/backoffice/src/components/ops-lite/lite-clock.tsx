'use client';

import { useLocale } from 'next-intl';
import { useEffect, useState } from 'react';

import { opsTime } from '@/lib/ops-format';

/** The header's Havana time ("14:32"), ticking every 15 s like the desk's clock. */
export function LiteClock({ serverNow }: { serverNow: number }) {
  const locale = useLocale();
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <time dateTime={new Date(now).toISOString()}>{opsTime(new Date(now), locale)}</time>
  );
}

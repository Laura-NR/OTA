'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

/** "Error reference 404 · /en/old-link": the status and the path someone landed on. */
export function ErrorReference({ prefix }: { prefix: string }) {
  const t = useTranslations('errors.notFound');
  const pathname = usePathname();
  return (
    <span className="font-mono">
      {t('reference', { reference: `${prefix} · ${pathname}` })}
    </span>
  );
}

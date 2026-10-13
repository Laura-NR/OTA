'use client';

import { SUPPORTED_LOCALES } from '@ota/i18n';
import { cn } from '@ota/ui';
import { useLocale } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';

/** Locale links that keep the visitor on the current page. */
export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 text-caption uppercase">
      {SUPPORTED_LOCALES.map((candidate) => (
        <Link
          key={candidate}
          href={pathname}
          locale={candidate}
          className={cn(
            'rounded px-1.5 py-0.5 transition-colors',
            candidate === locale
              ? 'bg-action-primary text-on-primary'
              : 'text-muted hover:text-default',
          )}
        >
          {candidate}
        </Link>
      ))}
    </div>
  );
}

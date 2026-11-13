'use client';

import { SUPPORTED_LOCALES } from '@ota/i18n';
import { cn } from '@ota/ui';
import { useLocale } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';

/** "español", in its own language, with the first letter capitalised. */
function nativeName(locale: string): string {
  const name = new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

/**
 * Locale links that keep the visitor on the current page. Each shows its code
 * and is named, in its own language, by the language it opens ("Español"
 * contains the visible "es"); the current one is marked. On a touch screen
 * each takes taps 44 px tall (DS 05), at the width the header has room for.
 */
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
          lang={candidate}
          hrefLang={candidate}
          aria-label={nativeName(candidate)}
          aria-current={candidate === locale ? 'true' : undefined}
          data-analytics-event="locale_changed"
          data-analytics-from={locale}
          data-analytics-to={candidate}
          data-analytics-kind="locale"
          className={cn(
            // On a touch screen taps land 12 px above and below the 20 px pill (44 px).
            'relative rounded px-1.5 py-0.5 transition-colors pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3 pointer-coarse:after:content-[""]',
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

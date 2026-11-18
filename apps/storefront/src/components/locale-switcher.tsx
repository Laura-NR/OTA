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

export interface LocaleSwitcherProps {
  /** `pills`: the header's codes; `list`: the menu drawer's 48 px rows. */
  variant?: 'pills' | 'list';
  /** Called when a locale is followed (the drawer closes on it). */
  onNavigate?: () => void;
  className?: string;
}

/**
 * Locale links that keep the visitor on the current page; the current one is
 * marked. As pills each shows its code and is named, in its own language, by
 * the language it opens ("Español" contains the visible "es"); on a touch
 * screen each takes taps 44 px tall (DS 05), at the width the header has room
 * for. As a list each row shows that name (DS-Mobile-Patterns: language in the
 * drawer).
 */
export function LocaleSwitcher({
  variant = 'pills',
  onNavigate,
  className,
}: LocaleSwitcherProps) {
  const locale = useLocale();
  const pathname = usePathname();

  const links = SUPPORTED_LOCALES.map((candidate) => {
    const current = candidate === locale;
    return (
      <Link
        key={candidate}
        href={pathname}
        locale={candidate}
        lang={candidate}
        hrefLang={candidate}
        aria-label={variant === 'pills' ? nativeName(candidate) : undefined}
        aria-current={current ? 'true' : undefined}
        onClick={onNavigate}
        data-analytics-event="locale_changed"
        data-analytics-from={locale}
        data-analytics-to={candidate}
        data-analytics-kind="locale"
        className={
          variant === 'pills'
            ? cn(
                // On a touch screen taps land 12 px above and below the 20 px pill (44 px).
                'relative rounded px-1.5 py-0.5 transition-colors pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3 pointer-coarse:after:content-[""]',
                current ? 'bg-action-primary text-on-primary' : 'text-muted hover:text-default',
              )
            : cn(
                'flex h-12 items-center px-1 text-body',
                current ? 'font-semibold text-primary-700' : 'text-default',
              )
        }
      >
        {variant === 'pills' ? candidate : nativeName(candidate)}
      </Link>
    );
  });

  return variant === 'pills' ? (
    <div className={cn('flex items-center gap-1 text-caption uppercase', className)}>
      {links}
    </div>
  ) : (
    <ul className={cn('flex flex-col', className)}>
      {links.map((link) => (
        <li key={link.key} className="border-b">
          {link}
        </li>
      ))}
    </ul>
  );
}

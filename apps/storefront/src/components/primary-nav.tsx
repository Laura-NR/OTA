'use client';

import { cn } from '@ota/ui';
import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { isCurrent, PRIMARY_NAV } from '@/lib/site-nav';

/**
 * The Home header's link row, from `lg` (DS 07): 15/20 nav type in ink; the
 * current page in primary 700 over a 2 px primary 600 rule, a hover in neutral
 * 300.
 */
export function PrimaryNav() {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <nav
      aria-label={t('primary')}
      className="hidden flex-1 gap-4 whitespace-nowrap lg:flex xl:gap-5"
    >
      {PRIMARY_NAV.map((link) => {
        if (!link.href) {
          return null;
        }
        const current = isCurrent(pathname, link.href);
        return (
          <Link
            key={link.key}
            href={link.href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'border-b-2 px-1 py-2.5 text-nav transition-colors',
              current
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-default hover:border-neutral-300 hover:text-primary-700',
            )}
          >
            {t(link.key)}
          </Link>
        );
      })}
    </nav>
  );
}

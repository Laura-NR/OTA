'use client';

import { cn, Icon } from '@ota/ui';
import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { BOTTOM_NAV, isCurrent } from '@/lib/site-nav';

import { SiteMenu } from './site-menu';

/**
 * The xs and sm bottom bar (M-Home, DS 07): 64 px, Home · Search · Trips ·
 * Support and the menu, the current one in primary 700. The labels are drawn at
 * 11/14, which is not on the type scale; they use the 12/16 caption until the
 * design answers change request 02 (B2).
 */
export function BottomNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <nav
      aria-label={t('main')}
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t bg-surface md:hidden"
    >
      {BOTTOM_NAV.map((link) => {
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
              'flex flex-1 flex-col items-center justify-center gap-1 text-caption',
              current ? 'font-bold text-primary-700' : 'text-secondary',
            )}
          >
            <Icon name={link.icon} />
            {t(link.key)}
          </Link>
        );
      })}
      <SiteMenu signedIn={signedIn} variant="bottom" />
    </nav>
  );
}

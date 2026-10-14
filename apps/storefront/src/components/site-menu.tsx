'use client';

import { cn, Drawer, Icon } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { Link, usePathname } from '@/i18n/navigation';
import { isCurrent, PRIMARY_NAV } from '@/lib/site-nav';

export interface SiteMenuProps {
  signedIn: boolean;
  /** `header`: an icon button; `bottom`: the labelled last slot of the bottom nav. */
  variant: 'header' | 'bottom';
  className?: string;
}

const subscribeNever = () => () => undefined;

/**
 * The menu drawer below `lg` (DS 07, DS-Mobile-Patterns): the header links in
 * 48 px rows, then sign-in or the account. It closes when a link is followed,
 * because the header outlives client navigation. The drawer is portalled to
 * `<body>` once hydrated, so the dialog never sits inside the header's or the
 * bottom bar's landmark.
 */
export function SiteMenu({ signedIn, variant, className }: SiteMenuProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations('nav');
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const close = () => setOpen(false);

  const links = [
    ...PRIMARY_NAV.flatMap((link) =>
      link.href ? [{ key: link.key, href: link.href }] : [],
    ),
    signedIn ? { key: 'account', href: '/account' } : { key: 'signIn', href: '/login' },
  ];

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn(
          variant === 'header'
            ? 'inline-flex h-touch w-touch items-center justify-center rounded-md text-primary-600 hover:bg-primary-100'
            : 'flex flex-1 flex-col items-center justify-center gap-1 text-caption text-secondary',
          className,
        )}
      >
        <Icon name="menu" />
        {variant === 'header' ? (
          <span className="sr-only">{t('openMenu')}</span>
        ) : (
          t('menu')
        )}
      </button>
      {hydrated
        ? createPortal(
            <Drawer
              open={open}
              onClose={close}
              title={t('menu')}
              closeLabel={t('closeMenu')}
            >
              <ul className="flex flex-col">
                {links.map((link) => {
                  const current = isCurrent(pathname, link.href);
                  return (
                    <li key={link.key} className="border-b">
                      <Link
                        href={link.href}
                        onClick={close}
                        aria-current={current ? 'page' : undefined}
                        className={cn(
                          'flex h-12 items-center px-1 text-body',
                          current ? 'font-semibold text-primary-700' : 'text-default',
                        )}
                      >
                        {t(link.key)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Drawer>,
            document.body,
          )
        : null}
    </>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef } from 'react';

import { Link } from '@/i18n/navigation';

import { CookieChoices } from './cookie-choices';

/**
 * DS 04 "Cookies, your choice": shown until the visitor chooses for the
 * words in force. It is a labelled region, not a dialog, so the page stays
 * usable; it comes first in the page so a keyboard reaches it first, and sits
 * above the bottom bar on a phone, where its actions stay in view while the
 * rows scroll. Its measured height joins the root's scroll padding and bottom
 * padding (globals.css), so focus is never scrolled under it and the end of
 * the page can scroll clear of it (WCAG 2.4.11).
 */
export function CookieBanner() {
  const t = useTranslations('cookies');
  const titleId = useId();
  const banner = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = banner.current;
    if (!element) {
      return;
    }
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty('--cookie-banner', `${element.offsetHeight}px`);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--cookie-banner');
    };
  }, []);

  return (
    <section
      ref={banner}
      aria-labelledby={titleId}
      className="fixed inset-x-0 bottom-16 z-40 px-4 pb-4 md:bottom-0"
    >
      <div className="mx-auto flex max-h-[60vh] max-w-[720px] flex-col gap-4 overflow-y-auto rounded-lg border bg-surface p-5 shadow-lg">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-h4 text-default">
            {t('bannerTitle')}
          </h2>
          <p className="text-body-sm text-secondary">
            {t('bannerBody')}{' '}
            <Link
              href="/legal/privacy"
              className="text-primary-600 underline underline-offset-[3px] hover:text-primary-700"
            >
              {t('privacyLink')}
            </Link>
          </p>
        </div>
        <CookieChoices source="banner" stickyActions compactOnPhone />
      </div>
    </section>
  );
}

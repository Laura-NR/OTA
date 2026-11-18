'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef } from 'react';

import { Link } from '@/i18n/navigation';

import { CookieChoices } from './cookie-choices';

/** Room below a focused control for its ring, above the banner's sticky actions. */
const FOCUS_RING_ROOM = 8;

/**
 * DS 04 "Cookies, your choice": shown until the visitor chooses for the
 * words in force. It is a labelled region, not a dialog, so the page stays
 * usable; it comes first in the page so a keyboard reaches it first, and sits
 * above the bottom bar on a phone, where its actions stay in view while the
 * rows scroll. The purposes wait behind "Choose by purpose" at every width;
 * from lg the closed banner is one row as wide as the page column. Its
 * measured height joins the root's scroll padding and bottom padding
 * (globals.css), so focus is never scrolled under it and the end of the page
 * can scroll clear of it (WCAG 2.4.11). Inside it, the sticky actions' measured
 * height is the scroll container's bottom scroll padding, so a switch reached
 * with Shift+Tab is scrolled above them rather than behind them.
 */
export function CookieBanner() {
  const t = useTranslations('cookies');
  const titleId = useId();
  const banner = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

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

  // Inside the banner, focus moving back from the actions must not land under them.
  useEffect(() => {
    const element = scroller.current;
    const actions = element?.querySelector<HTMLElement>('[data-sticky-actions]');
    if (!element || !actions) {
      return;
    }
    const observer = new ResizeObserver(() => {
      element.style.scrollPaddingBottom =
        getComputedStyle(actions).position === 'sticky'
          ? `${actions.offsetHeight + FOCUS_RING_ROOM}px`
          : '';
    });
    observer.observe(actions);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={banner}
      aria-labelledby={titleId}
      className="fixed inset-x-0 bottom-16 z-40 px-4 pb-4 md:bottom-0 lg:mx-auto lg:max-w-container lg:px-10"
    >
      <div
        ref={scroller}
        className="mx-auto max-h-[60vh] max-w-[720px] overflow-y-auto rounded-lg border bg-surface p-5 shadow-lg lg:max-w-none"
      >
        <CookieChoices
          source="banner"
          stickyActions
          compact
          intro={
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
          }
        />
      </div>
    </section>
  );
}

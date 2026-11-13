'use client';

import { useLocale } from 'next-intl';
import { useEffect } from 'react';

import { routing } from '@/i18n/routing';

/**
 * Registers the offline service worker (`public/sw.js`) once the page has
 * loaded, so its install never competes with the page the visitor asked for.
 * It is told the locales and the visitor's own, whose offline page it keeps.
 * A browser without service workers simply has no offline mode.
 */
export function ServiceWorkerRegistration() {
  const locale = useLocale();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    const query = new URLSearchParams({
      locales: routing.locales.join(','),
      default: routing.defaultLocale,
      locale,
    });
    const register = () => {
      navigator.serviceWorker.register(`/sw.js?${query}`, { scope: '/' }).catch(() => {
        // Offline mode is a convenience; the site works without it.
      });
    };
    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, [locale]);
  return null;
}

'use client';

import { useEffect } from 'react';

import { routing } from '@/i18n/routing';

/**
 * Registers the offline service worker (`public/sw.js`), telling it the
 * locales so it can keep each locale's offline page. A browser without
 * service workers simply has no offline mode.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    const query = new URLSearchParams({
      locales: routing.locales.join(','),
      default: routing.defaultLocale,
    });
    navigator.serviceWorker.register(`/sw.js?${query}`, { scope: '/' }).catch(() => {
      // Offline mode is a convenience; the site works without it.
    });
  }, []);
  return null;
}

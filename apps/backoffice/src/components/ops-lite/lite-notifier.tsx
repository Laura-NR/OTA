'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { useDeskAlerts } from '../desk-alerts';

/** Whether this browser can show a notification and the person allowed it. */
export function notificationsAllowed(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

/**
 * Ops Lite's push (ADR 0007 A5): a browser notification for each red crossing
 * while the page is open but out of sight (another tab, the screen off). With
 * the page in view the strip, the cue and the live region already say it. No
 * service worker: a closed page notifies nobody, as the ADR settles.
 */
export function LiteNotifier() {
  const t = useTranslations('backoffice.opsLite.push');
  const alerts = useDeskAlerts();
  const seen = useRef(alerts?.announced.seq ?? 0);
  const announced = alerts?.announced;

  useEffect(() => {
    if (!announced || announced.seq === seen.current) return;
    seen.current = announced.seq;
    if (
      !announced.red ||
      document.visibilityState === 'visible' ||
      !notificationsAllowed()
    ) {
      return;
    }
    const notification = new Notification(t('title'), {
      body: announced.red,
      tag: 'ops-lite-red',
    });
    notification.onclick = () => {
      window.focus();
      window.location.assign('/lite/alerts');
      notification.close();
    };
  }, [announced?.seq]);

  return null;
}

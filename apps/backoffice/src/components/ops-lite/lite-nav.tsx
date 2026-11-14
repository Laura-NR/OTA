'use client';

import type { OpsLiteInboxDto } from '@ota/schemas';
import { cn, Icon, type IconName } from '@ota/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useDeskLocked } from '@/components/desk-idle-lock';
import { apiRequest } from '@/lib/client-api';

import { useDeskAlerts } from '../desk-alerts';

/** How often the bar re-reads the inbox's unread count. */
const UNREAD_REFRESH_MS = 60_000;

const TABS: {
  key: 'alerts' | 'pipeline' | 'inbox' | 'desk';
  href: string;
  icon: IconName;
}[] = [
  { key: 'alerts', href: '/lite/alerts', icon: 'alert-triangle' },
  { key: 'pipeline', href: '/lite/pipeline', icon: 'columns' },
  { key: 'inbox', href: '/lite/inbox', icon: 'message-circle' },
  { key: 'desk', href: '/dashboard', icon: 'layout-dashboard' },
];

/**
 * AL-*'s bottom bar: four 64 px tabs, the current one in primary 700 and
 * bold. Alerts counts the red bookings nobody acknowledged and Inbox the
 * threads with unopened traveler messages, each in a red dot; the screen
 * reader hears the count in the link's name. The inbox count is read again
 * every minute and on each screen change.
 */
export function LiteNav({ initialUnread }: { initialUnread: number }) {
  const t = useTranslations('backoffice.opsLite.nav');
  const pathname = usePathname();
  const alerts = useDeskAlerts();
  const locked = useDeskLocked();
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => {
    if (locked) return;
    const read = () =>
      void apiRequest<OpsLiteInboxDto>('/ops-lite/inbox')
        .then((inbox) => setUnread(inbox.counts.unread))
        .catch(() => undefined);
    read();
    const timer = setInterval(read, UNREAD_REFRESH_MS);
    return () => clearInterval(timer);
  }, [pathname, locked]);

  const redBookings = alerts
    ? new Set(
        alerts.red
          .filter((entry) => !alerts.isAcknowledged(entry.item))
          .map((entry) => entry.row.reservationId),
      ).size
    : 0;
  const counts: Partial<Record<(typeof TABS)[number]['key'], number>> = {
    alerts: redBookings,
    inbox: unread,
  };

  return (
    <nav
      aria-label={t('label')}
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(31,27,23,.06)]"
    >
      <ul className="mx-auto flex h-16 max-w-[30rem]">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || (tab.key === 'alerts' && pathname === '/lite');
          const count = counts[tab.key] ?? 0;
          return (
            <li key={tab.key} className="flex flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                aria-label={
                  count > 0 ? t('withCount', { tab: t(tab.key), count }) : undefined
                }
                className={cn(
                  'relative flex flex-1 flex-col items-center justify-center gap-1 text-caption focus-visible:-outline-offset-4',
                  active ? 'font-bold text-primary-700' : 'font-medium text-muted',
                )}
              >
                <Icon name={tab.icon} />
                {t(tab.key)}
                {count > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-[calc(50%+0.375rem)] top-2 min-w-4 rounded-full bg-error-600 px-1 text-center text-caption font-bold leading-4 text-neutral-0"
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

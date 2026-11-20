import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { AlertAnnouncements } from '../alert-strip';
import { LiteNav } from './lite-nav';
import { LiteNotifier } from './lite-notifier';

/**
 * Ops Lite's frame (AL-*): one phone-wide column on the warm page, each
 * screen's own header at its top and the bottom bar (Alerts, Pipeline,
 * Inbox, Desk) fixed below. On a wider screen the column stays phone-wide and
 * centred. The crossings' live regions come first, as on the desk.
 */
export async function LiteShell({
  unread,
  children,
}: {
  /** Threads with traveler messages nobody opened, at render time. */
  unread: number;
  children: ReactNode;
}) {
  const t = await getTranslations('backoffice.opsLite');
  return (
    <div className="min-h-screen bg-page">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-3 focus:text-body-sm focus:font-semibold focus:text-primary-700 focus:shadow-md"
      >
        {t('skip')}
      </a>
      <div className="mx-auto flex min-h-screen w-full max-w-[30rem] flex-col">
        <main
          id="main"
          tabIndex={-1}
          className="flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] focus:outline-none"
        >
          <AlertAnnouncements />
          {children}
        </main>
      </div>
      <LiteNav initialUnread={unread} />
      <LiteNotifier />
    </div>
  );
}

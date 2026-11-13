import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import type { ServerSession } from '@/lib/api';
import { brand } from '@/lib/brand';

import { AlertAnnouncements, ShellAlertStrip } from './alert-strip';
import { DeskShortcuts } from './desk-shortcuts';
import { LocaleSwitcher } from './locale-switcher';
import { MainNav } from './main-nav';
import { SectionNav } from './section-nav';
import { SignOutButton } from './sign-out-button';

export interface AppShellProps {
  user: ServerSession['user'];
  agencyName: string;
  children: ReactNode;
}

const ROLE_KEYS: Readonly<Record<string, string>> = {
  SUPER_ADMIN: 'superAdmin',
  OPERATIONS_ADMIN: 'operationsAdmin',
  ADMINISTRATIVE_SUPPORT: 'administrativeSupport',
  SERVICE_WORKER: 'serviceWorker',
  TRAVELER: 'traveler',
};

function initials(name: string): string {
  return name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/**
 * The A-Dashboard desk shell. From `lg` the 240 px primary 700 sidebar stays
 * open: the wordmark with the "Ops" caption, the section links, and the
 * signed-in person at the foot. Below `lg` the sidebar stacks above the
 * content as a wrapping row of links (DS 07 §03). A skip link, the first stop,
 * jumps past the sidebar to the page (WCAG 2.4.1). The page starts with the
 * desk's dispatch alert strip on every page but the dashboard.
 */
export async function AppShell({ user, agencyName, children }: AppShellProps) {
  const t = await getTranslations('backoffice.shell');
  const name = user.name?.trim() || user.email;
  const roleKey = user.role ? ROLE_KEYS[user.role] : undefined;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-3 focus:text-body-sm focus:font-semibold focus:text-primary-700 focus:shadow-md"
      >
        {t('skip')}
      </a>
      <aside className="flex flex-col gap-4 bg-primary-700 px-4 pb-6 pt-5 text-neutral-0 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <Link
          href="/dashboard"
          aria-label={t('desk', { agency: agencyName })}
          className="inline-flex items-center gap-2.5 self-start px-3 pb-2 pt-1 focus-visible:outline-accent-500"
        >
          <Image
            src={brand.wordmarkWhite}
            alt=""
            height={26}
            className="h-[26px] w-auto"
            unoptimized
          />
          <span className="text-caption text-primary-200">{t('ops')}</span>
        </Link>
        <MainNav />
        <div className="mt-auto flex flex-col gap-2.5 rounded-lg bg-neutral-0/[.08] p-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-500 text-label font-bold text-neutral-900"
            >
              {initials(name)}
            </span>
            <div className="flex min-w-0 flex-col">
              <strong className="truncate text-label">{name}</strong>
              {roleKey ? (
                <span className="text-caption font-normal text-primary-200">
                  {t(`roles.${roleKey}`)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4">
            <Link
              href="/passkeys"
              className="inline-flex min-h-touch items-center text-caption font-normal text-primary-200 underline underline-offset-[3px] hover:text-neutral-0 focus-visible:outline-accent-500"
            >
              {t('passkeys')}
            </Link>
            <SignOutButton />
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-end gap-2 border-b bg-surface px-6">
          <DeskShortcuts />
          <LocaleSwitcher />
        </header>
        <SectionNav />
        <main id="main" tabIndex={-1} className="flex-1 bg-page p-6 focus:outline-none">
          <AlertAnnouncements />
          <ShellAlertStrip />
          {children}
        </main>
      </div>
    </div>
  );
}

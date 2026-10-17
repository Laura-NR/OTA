import type { EmergencyContact } from '@ota/config';
import { cn, Icon } from '@ota/ui';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { SignOutButton } from '@/components/sign-out-button';
import { Link } from '@/i18n/navigation';

export type AccountSection =
  'overview' | 'trips' | 'documents' | 'messages' | 'preferences';

const SECTIONS: readonly { key: AccountSection; href: string }[] = [
  { key: 'overview', href: '/account' },
  { key: 'trips', href: '/account?tab=trips' },
  { key: 'documents', href: '/account?tab=documents' },
  { key: 'messages', href: '/account?tab=messages' },
  { key: 'preferences', href: '/account?tab=preferences' },
];

function initials(name: string): string {
  return (
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('') || '·'
  );
}

/**
 * The Account frame (Account / M-Account boards): from `lg` a sidebar with the
 * traveler, the sections, the emergency line and sign-out; below it the
 * traveler over a row of section tabs. Preferences holds the notification
 * consents (M3); the board's payments, travelers and reviews sections wait for
 * their data (deposits M4, the traveler-side party), so they are not listed.
 */
export async function AccountShell({
  current,
  name,
  email,
  counts,
  emergency,
  children,
}: {
  current: AccountSection;
  name: string | null;
  email: string;
  /** Badges on the sections that have something waiting. */
  counts: Partial<Record<AccountSection, number>>;
  /** The agency's 24/7 line, first of the manifest's emergency contacts. */
  emergency: EmergencyContact | null;
  children: ReactNode;
}) {
  const t = await getTranslations('account');
  const label = name ?? email;

  const link = (section: (typeof SECTIONS)[number], tab: boolean) => {
    const on = section.key === current;
    const count = counts[section.key];
    return (
      <Link
        key={section.key}
        href={section.href}
        aria-current={on ? 'page' : undefined}
        className={cn(
          tab
            ? 'flex h-12 shrink-0 items-center gap-2 border-b-[3px] px-1 text-nav'
            : 'flex h-11 items-center justify-between gap-2 rounded-md px-3 text-body',
          tab
            ? on
              ? 'border-primary-600 font-semibold text-primary-700'
              : 'border-transparent text-default hover:border-neutral-300'
            : on
              ? 'bg-primary-100 font-semibold text-primary-700'
              : 'text-default hover:bg-neutral-100',
        )}
      >
        {t(`nav.${section.key}`)}
        {count ? (
          <>
            <span
              aria-hidden="true"
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1.5 text-caption font-bold text-neutral-900"
            >
              {count}
            </span>
            <span className="sr-only"> ({count})</span>
          </>
        ) : null}
      </Link>
    );
  };

  return (
    <div className="mx-auto grid w-full max-w-container gap-8 px-6 py-8 md:px-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-10">
      <aside className="flex min-w-0 flex-col gap-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-700"
          >
            {initials(label)}
          </span>
          <div className="flex min-w-0 flex-col">
            <p className="truncate text-body font-semibold text-default">{label}</p>
            {name ? <p className="truncate text-caption text-muted">{email}</p> : null}
          </div>
        </div>
        <nav
          aria-label={t('nav.label')}
          className="-mx-6 overflow-x-auto border-b px-6 lg:hidden"
        >
          <div className="flex gap-6">
            {SECTIONS.map((section) => link(section, true))}
          </div>
        </nav>
        <nav aria-label={t('nav.label')} className="hidden flex-col gap-1 lg:flex">
          {SECTIONS.map((section) => link(section, false))}
        </nav>
        {emergency ? (
          <div className="hidden flex-col gap-2 rounded-lg border border-error-200 bg-error-100 p-4 lg:flex">
            <p className="text-body-sm font-semibold text-error-700">
              {t('emergency.title')}
            </p>
            <a
              href={`tel:${emergency.phone.replace(/[^\d+]/g, '')}`}
              className="flex h-10 items-center gap-2 rounded-md border border-error-200 bg-surface px-3 text-body-sm font-semibold text-error-700"
            >
              <Icon name="phone" className="h-4 w-4" />
              {emergency.phone}
            </a>
            <p className="text-caption text-error-700">{emergency.label}</p>
          </div>
        ) : null}
        <div className="hidden lg:block">
          <SignOutButton />
        </div>
      </aside>
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </div>
  );
}

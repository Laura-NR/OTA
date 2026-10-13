import type { ReactNode } from 'react';

import type { ServerSession } from '@/lib/api';

import { LocaleSwitcher } from './locale-switcher';
import { MainNav } from './main-nav';
import { SignOutButton } from './sign-out-button';

export interface AppShellProps {
  user: ServerSession['user'];
  agencyName: string;
  children: ReactNode;
}

export function AppShell({ user, agencyName, children }: AppShellProps) {
  return (
    <div className="grid min-h-screen grid-cols-[15rem_1fr]">
      {/* A-Dashboard: the 240 px dark sidebar, primary 700 with white text. */}
      <aside className="bg-primary-700 text-neutral-0">
        <div className="px-5 py-5 text-body-lg font-semibold">{agencyName}</div>
        <MainNav />
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-surface px-6">
          <span className="truncate text-body-sm text-muted">{user.email}</span>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 bg-page p-6">{children}</main>
      </div>
    </div>
  );
}

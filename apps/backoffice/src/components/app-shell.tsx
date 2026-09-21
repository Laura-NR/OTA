import type { ReactNode } from 'react';

import type { ServerSession } from '@/lib/api';

import { MainNav } from './main-nav';
import { SignOutButton } from './sign-out-button';

export interface AppShellProps {
  user: ServerSession['user'];
  agencyName: string;
  children: ReactNode;
}

export function AppShell({ user, agencyName, children }: AppShellProps) {
  return (
    <div className="grid min-h-screen grid-cols-[16rem_1fr]">
      <aside className="border-r bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-5 text-lg font-semibold">{agencyName}</div>
        <MainNav />
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-background px-6">
          <span className="truncate text-sm text-muted-foreground">{user.email}</span>
          <SignOutButton />
        </header>
        <main className="flex-1 bg-background p-6">{children}</main>
      </div>
    </div>
  );
}

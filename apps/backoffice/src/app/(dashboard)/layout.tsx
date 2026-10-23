import { isStaffSessionExpired } from '@ota/domain';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { getServerSession } from '@/lib/api';
import { getTenantConfig } from '@/lib/tenant';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  if (!session) {
    redirect('/login');
  }
  // The API refuses a staff session 12 h after sign-in (M9 D9); send the
  // person to sign in again rather than show a desk whose every call fails.
  if (
    session.session?.createdAt &&
    isStaffSessionExpired(
      session.user.role,
      new Date(session.session.createdAt),
      new Date(),
    )
  ) {
    redirect('/login');
  }

  const tenant = getTenantConfig();

  return (
    <AppShell user={session.user} agencyName={tenant.branding.agencyName}>
      {children}
    </AppShell>
  );
}

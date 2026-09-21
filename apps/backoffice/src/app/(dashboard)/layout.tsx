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

  const tenant = getTenantConfig();

  return (
    <AppShell user={session.user} agencyName={tenant.branding.agencyName}>
      {children}
    </AppShell>
  );
}

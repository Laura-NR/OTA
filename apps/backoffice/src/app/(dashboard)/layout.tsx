import { PASSKEY_SIGN_IN_METHOD, isStaffRole, isStaffSessionExpired } from '@ota/domain';
import type { PasskeyStatusDto } from '@ota/schemas';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { DeskTelemetryProvider } from '@/components/telemetry/desk-telemetry';
import { apiFetch, getServerSession } from '@/lib/api';
import { ApiError } from '@/lib/errors';
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
  // The staff passkey rule (docs/schema-m9-passkeys.md P3): a staff session
  // that did not come from a passkey asks where it stands, and one the rule
  // holds back sets up its passkey or signs in with it instead.
  if (
    isStaffRole(session.user.role) &&
    session.session?.signInMethod !== PASSKEY_SIGN_IN_METHOD
  ) {
    const status = await apiFetch<PasskeyStatusDto>('/me/passkeys').catch(
      (error: unknown) => {
        // A deactivated account: sign in again rather than show a broken desk.
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      },
    );
    if (!status) redirect('/login');
    if (status.state === 'enroll') redirect('/passkeys');
    if (status.state === 'use_passkey') redirect('/login?passkey=required');
  }

  const tenant = getTenantConfig();

  return (
    // EUR is the base currency; display currencies are M9 D7 (deferred).
    <DeskTelemetryProvider currency="EUR">
      <AppShell user={session.user} agencyName={tenant.branding.agencyName}>
        {children}
      </AppShell>
    </DeskTelemetryProvider>
  );
}

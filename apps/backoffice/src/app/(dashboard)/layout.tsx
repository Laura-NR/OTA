import { PASSKEY_SIGN_IN_METHOD, isStaffRole, isStaffSessionExpired } from '@ota/domain';
import type { DeskSessionDto, PasskeyStatusDto } from '@ota/schemas';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { DeskIdleLock } from '@/components/desk-idle-lock';
import { DeskTelemetryProvider } from '@/components/telemetry/desk-telemetry';
import { apiFetch, getServerSession } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { lockedRefusal } from '@/lib/idle-lock';
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
  const passkeySession = session.session?.signInMethod === PASSKEY_SIGN_IN_METHOD;
  // The idle lock (docs/schema-m9-idle-lock.md): a locked session sees only
  // the lock, which keeps the address; unlocking renders the page again.
  let deskSession: DeskSessionDto | null = null;
  if (isStaffRole(session.user.role)) {
    let locked: { minutes: number | null } | null = null;
    try {
      deskSession = await apiFetch<DeskSessionDto>('/me/session');
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        (error.status !== 401 && error.status !== 403)
      ) {
        throw error;
      }
      locked = lockedRefusal(error.details);
    }
    // Any other refusal is the passkey rule's below (setup, sign in with the
    // passkey); a passkey session refused here is deactivated or expired.
    if (!deskSession && !locked && passkeySession) redirect('/login');
    if (locked) {
      return (
        <DeskTelemetryProvider currency="EUR">
          <DeskIdleLock
            user={session.user}
            session={null}
            lockedAfter={locked.minutes}
            hasPasskey={passkeySession ? true : null}
          />
        </DeskTelemetryProvider>
      );
    }
  }
  // The staff passkey rule (docs/schema-m9-passkeys.md P3): a staff session
  // that did not come from a passkey asks where it stands, and one the rule
  // holds back sets up its passkey or signs in with it instead.
  let hasPasskey = passkeySession;
  if (isStaffRole(session.user.role) && !passkeySession) {
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
    hasPasskey = status.passkeys.length > 0;
  }

  const tenant = getTenantConfig();

  return (
    // EUR is the base currency; display currencies are M9 D7 (deferred).
    <DeskTelemetryProvider currency="EUR">
      <DeskIdleLock user={session.user} session={deskSession} hasPasskey={hasPasskey}>
        <AppShell user={session.user} agencyName={tenant.branding.agencyName}>
          {children}
        </AppShell>
      </DeskIdleLock>
    </DeskTelemetryProvider>
  );
}

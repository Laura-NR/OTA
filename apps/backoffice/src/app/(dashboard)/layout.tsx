import { isStaffRole } from '@ota/domain';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { DeskAlerts } from '@/components/desk-alerts';
import { DeskIdleLock } from '@/components/desk-idle-lock';
import { DeskTelemetryProvider } from '@/components/telemetry/desk-telemetry';
import { deskAlertsSeed, deskGate } from '@/lib/desk-gate';
import { getTenantConfig } from '@/lib/tenant';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const gate = await deskGate();
  if (gate.kind === 'locked') {
    return (
      <DeskTelemetryProvider currency="EUR">
        <DeskIdleLock
          user={gate.session.user}
          session={null}
          lockedAfter={gate.minutes}
          hasPasskey={gate.passkeySession ? true : null}
        />
      </DeskTelemetryProvider>
    );
  }
  const { session, deskSession, hasPasskey } = gate;

  const tenant = getTenantConfig();
  const shell = (
    <AppShell user={session.user} agencyName={tenant.branding.agencyName}>
      {children}
    </AppShell>
  );

  // The dispatch alerts follow staff around the desk, not only the dashboard.
  let desk = shell;
  if (isStaffRole(session.user.role)) {
    desk = <DeskAlerts {...await deskAlertsSeed(session.user.role)}>{shell}</DeskAlerts>;
  }

  return (
    // EUR is the base currency; display currencies are M9 D7 (deferred).
    <DeskTelemetryProvider currency="EUR">
      <DeskIdleLock user={session.user} session={deskSession} hasPasskey={hasPasskey}>
        {desk}
      </DeskIdleLock>
    </DeskTelemetryProvider>
  );
}

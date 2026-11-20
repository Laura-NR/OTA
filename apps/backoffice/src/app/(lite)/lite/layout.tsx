import { isStaffRole } from '@ota/domain';
import type { OpsLiteInboxDto } from '@ota/schemas';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { DeskAlerts } from '@/components/desk-alerts';
import { DeskIdleLock } from '@/components/desk-idle-lock';
import { LiteShell } from '@/components/ops-lite/lite-shell';
import { DeskTelemetryProvider } from '@/components/telemetry/desk-telemetry';
import { apiFetch } from '@/lib/api';
import { deskAlertsSeed, deskGate } from '@/lib/desk-gate';

/**
 * Ops Lite (AL-*): the desk's triage on a phone, inside the back-office
 * (ADR 0007). It passes the desk's own checks (`deskGate`) and carries the
 * desk's live alerts, with its acknowledgements and mutes recorded as Ops
 * Lite's; only staff get it.
 */
export default async function OpsLiteLayout({ children }: { children: ReactNode }) {
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
  if (!isStaffRole(session.user.role)) {
    redirect('/dashboard');
  }

  const [seed, inbox] = await Promise.all([
    deskAlertsSeed(session.user.role),
    apiFetch<OpsLiteInboxDto>('/ops-lite/inbox').catch(() => null),
  ]);

  return (
    <DeskTelemetryProvider currency="EUR">
      <DeskIdleLock user={session.user} session={deskSession} hasPasskey={hasPasskey}>
        <DeskAlerts {...seed} channel="ops_lite">
          <LiteShell unread={inbox?.counts.unread ?? 0}>{children}</LiteShell>
        </DeskAlerts>
      </DeskIdleLock>
    </DeskTelemetryProvider>
  );
}

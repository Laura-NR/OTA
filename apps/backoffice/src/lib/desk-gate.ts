import { PASSKEY_SIGN_IN_METHOD, isStaffRole, isStaffSessionExpired } from '@ota/domain';
import type {
  DeskAlertMuteStateDto,
  DeskSessionDto,
  DispatchBoardRowDto,
  PasskeyStatusDto,
} from '@ota/schemas';
import { redirect } from 'next/navigation';

import { apiFetch, getServerSession, type ServerSession } from '@/lib/api';
import { deskClock } from '@/lib/desk-clock';
import { ApiError } from '@/lib/errors';
import { lockedRefusal } from '@/lib/idle-lock';
import { ipRefusal, ipRefusedLoginPath } from '@/lib/ip-allowlist';
import { getThresholds } from '@/lib/operating';
import { deskAccess } from '@/lib/overrides';

/** Where the staff checks leave a session: locked behind the idle lock, or in. */
export type DeskGate =
  | {
      kind: 'locked';
      session: ServerSession;
      /** The idle minutes that locked it, when the API said. */
      minutes: number | null;
      passkeySession: boolean;
    }
  | {
      kind: 'open';
      session: ServerSession;
      deskSession: DeskSessionDto | null;
      hasPasskey: boolean;
    };

/**
 * The checks a desk layout runs before it renders (the desk and Ops Lite):
 * signed in, a staff session within its 12 h, inside the Super Admin IP
 * allowlist, not idle-locked, and past the staff passkey rule. Each failure
 * redirects, except the idle lock, which the layout draws.
 */
export async function deskGate(): Promise<DeskGate> {
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
    let ipRefused: { address: string | null } | null = null;
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
      ipRefused = ipRefusal(error.details);
    }
    // A Super Admin signed in from outside the IP allowlist
    // (docs/schema-m9-ip-allowlist.md I3): the login page signs the session
    // out and names the address.
    if (ipRefused) redirect(ipRefusedLoginPath(ipRefused.address));
    // Any other refusal is the passkey rule's below (setup, sign in with the
    // passkey); a passkey session refused here is deactivated or expired.
    if (!deskSession && !locked && passkeySession) redirect('/login');
    if (locked) {
      return { kind: 'locked', session, minutes: locked.minutes, passkeySession };
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
  return { kind: 'open', session, deskSession, hasPasskey };
}

/** What `DeskAlerts` starts from: the board, the mute, the amber share and the role's rights. */
export async function deskAlertsSeed(role: string | null | undefined) {
  // Acknowledging and muting is the dispatch row: support reads the alerts
  // unless a permission override for dispatch runs.
  const [rows, muteState, thresholds, dispatchAccess] = await Promise.all([
    apiFetch<DispatchBoardRowDto[]>('/dispatch/active').catch(() => null),
    apiFetch<DeskAlertMuteStateDto>('/dispatch/alert-mute').catch(() => null),
    getThresholds(),
    deskAccess(role, 'dispatch'),
  ]);
  return {
    initialRows: rows,
    initialMute: muteState,
    serverNow: Date.now(),
    amberThreshold: deskClock(thresholds).amberThreshold,
    canManage: dispatchAccess.canManage,
  };
}

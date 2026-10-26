import { isStaffRole } from './staff';

/**
 * The staff passkey rule (`docs/schema-m9-passkeys.md` P1–P5). Pure: the API
 * reads the switch, the session's sign-in method and the passkey count, and
 * Better Auth's hooks ask `passkeyChangeRefusal` before a passkey changes.
 */

/** The sign-in method the auth package records for a passkey sign-in (P2). */
export const PASSKEY_SIGN_IN_METHOD = 'passkey';

/**
 * Why a session may not use the desk under the rule: `enroll` (no passkey
 * yet, so the session may only set one up, P3) or `use_passkey` (one exists,
 * so sign in with it). Travelers, suppliers and every session while the rule
 * is off pass, as does a staff session that came from a passkey. A session
 * with no recorded method (from before P2) is not a passkey session.
 */
export type PasskeyRefusal = 'enroll' | 'use_passkey';

export function passkeyRefusal(input: {
  role: string | null | undefined;
  required: boolean;
  signInMethod: string | null | undefined;
  passkeyCount: number;
}): PasskeyRefusal | null {
  if (!input.required || !isStaffRole(input.role)) return null;
  if (input.signInMethod === PASSKEY_SIGN_IN_METHOD) return null;
  return input.passkeyCount === 0 ? 'enroll' : 'use_passkey';
}

export type PasskeyChange = 'register' | 'rename' | 'delete';

export type PasskeyChangeRefusal = 'PASSKEY_SESSION_REQUIRED' | 'LAST_PASSKEY';

/**
 * Why a staff member may not make this change to their passkeys (P4), or
 * null. A staff member changes passkeys only from a passkey session, so a
 * stolen sign-in link cannot swap them; the exception is adding the first
 * one. While the rule is on, the last passkey stays. Others are not limited.
 */
export function passkeyChangeRefusal(input: {
  role: string | null | undefined;
  required: boolean;
  signInMethod: string | null | undefined;
  passkeyCount: number;
  change: PasskeyChange;
}): PasskeyChangeRefusal | null {
  if (!isStaffRole(input.role)) return null;
  if (input.change === 'register' && input.passkeyCount === 0) return null;
  if (input.signInMethod !== PASSKEY_SIGN_IN_METHOD) return 'PASSKEY_SESSION_REQUIRED';
  if (input.change === 'delete' && input.required && input.passkeyCount <= 1) {
    return 'LAST_PASSKEY';
  }
  return null;
}

/**
 * Whether the rule is in force: the applied switch, unless the deploy set
 * the break-glass `STAFF_PASSKEYS_OVERRIDE=off` (P5).
 */
export function staffPasskeysEnforced(
  switchedOn: boolean,
  override: string | null | undefined,
): boolean {
  return switchedOn && override?.trim().toLowerCase() !== 'off';
}

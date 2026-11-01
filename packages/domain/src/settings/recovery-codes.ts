/**
 * Staff recovery codes (`docs/schema-m9-recovery-codes.md` R1–R5). Pure: the
 * API draws the random bytes, hashes the code and keeps the rows; these rules
 * say what a code looks like, when it is open, when wrong tries withdraw it and
 * how long the session it opens lasts.
 */

/** The sign-in method the auth package records for a recovery-code sign-in. */
export const RECOVERY_CODE_SIGN_IN_METHOD = 'recovery_code';

/** How long an issued code works (the board: 15 minutes). */
export const RECOVERY_CODE_MINUTES = 15;

/** How long the setup-only session a code opens lasts (R3). */
export const RECOVERY_SESSION_MINUTES = 15;

/** Wrong codes for one person that withdraw their open code (R4). */
export const RECOVERY_CODE_MAX_FAILURES = 5;

/** Characters in a code, without the hyphens (R4: about 60 bits). */
export const RECOVERY_CODE_LENGTH = 12;

/** Crockford's base 32: no I, L, O or U, so a code reads out without look-alikes. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** What Crockford's decoding reads a look-alike as. */
const LOOK_ALIKES: Readonly<Record<string, string>> = { I: '1', L: '1', O: '0' };

const GROUP = 4;

/**
 * A code from random bytes, one character per byte. 256 is a multiple of 32,
 * so taking the low five bits keeps every character equally likely.
 */
export function recoveryCodeFromBytes(bytes: Uint8Array): string {
  if (bytes.length < RECOVERY_CODE_LENGTH) {
    throw new RangeError(`A recovery code needs ${RECOVERY_CODE_LENGTH} random bytes`);
  }
  let code = '';
  for (let index = 0; index < RECOVERY_CODE_LENGTH; index += 1) {
    code += ALPHABET[bytes[index]! & 31];
  }
  return code;
}

/** `XXXXXXXXXXXX` as `XXXX-XXXX-XXXX`, the way the desk shows it. */
export function formatRecoveryCode(code: string): string {
  const groups: string[] = [];
  for (let index = 0; index < code.length; index += GROUP) {
    groups.push(code.slice(index, index + GROUP));
  }
  return groups.join('-');
}

/**
 * What was typed, as the stored form, or null when it cannot be a code. Any
 * case, spaces and hyphens are accepted, and I, L and O read as 1, 1 and 0.
 */
export function normalizeRecoveryCode(typed: string): string | null {
  const code = [...typed.toUpperCase().replace(/[\s-]/g, '')]
    .map((character) => LOOK_ALIKES[character] ?? character)
    .join('');
  if (code.length !== RECOVERY_CODE_LENGTH) return null;
  return [...code].every((character) => ALPHABET.includes(character)) ? code : null;
}

/** When a code issued at this time stops working. */
export function recoveryCodeExpiresAt(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + RECOVERY_CODE_MINUTES * 60_000);
}

export type RecoveryCodeState = 'open' | 'used' | 'withdrawn' | 'expired';

/** A code works only while it is open: not used, withdrawn or expired. */
export function recoveryCodeState(
  code: { expiresAt: Date; usedAt: Date | null; withdrawnAt: Date | null },
  now: Date,
): RecoveryCodeState {
  if (code.usedAt) return 'used';
  if (code.withdrawnAt) return 'withdrawn';
  return now.getTime() < code.expiresAt.getTime() ? 'open' : 'expired';
}

/** Whether a wrong try, bringing the count to this, withdraws the code. */
export function recoveryFailureWithdraws(failedAttempts: number): boolean {
  return failedAttempts >= RECOVERY_CODE_MAX_FAILURES;
}

/**
 * Whether a session a recovery code opened has run its course (R3). Other
 * sessions are left to their own limits.
 */
export function isRecoverySessionOver(
  signInMethod: string | null | undefined,
  signedInAt: Date,
  now: Date,
): boolean {
  return (
    signInMethod === RECOVERY_CODE_SIGN_IN_METHOD &&
    now.getTime() - signedInAt.getTime() >= RECOVERY_SESSION_MINUTES * 60_000
  );
}

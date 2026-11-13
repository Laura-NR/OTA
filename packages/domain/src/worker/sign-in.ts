/**
 * Worker sign-in by a one-time code (ADR 0007, W-Login;
 * `docs/worker-app-plan.md` W1). Pure: the API draws the random bytes, hashes
 * the code and keeps it; these rules say what a phone number and a code look
 * like, how long a code works, when wrong tries void it and how long the
 * session it opens lasts.
 */

/** The sign-in method the auth package records for a worker-code sign-in. */
export const WORKER_CODE_SIGN_IN_METHOD = 'worker_code';

/** Digits in a code (W-Login: "Escribe el código", six boxes). */
export const WORKER_CODE_LENGTH = 6;

/** How long a code works (W-Login: "Caduca en 10 minutos"). */
export const WORKER_CODE_MINUTES = 10;

/** Wrong codes for one worker that void their open code. */
export const WORKER_CODE_MAX_FAILURES = 5;

/** How soon another code may be sent by SMS (W-Login: "Reenviar en 0:45"). */
export const WORKER_CODE_RESEND_SECONDS = 45;

/** How long the phone stays signed in (W-Login: "Sesión de 30 días en este teléfono"). */
export const WORKER_SESSION_DAYS = 30;

/** Cuba's country code; a national number has eight digits. */
const CUBA = '53';
const CUBA_NATIONAL_DIGITS = 8;

/** Codes below this, read as 32-bit numbers, keep every six-digit code equally likely. */
const UNBIASED_LIMIT =
  Math.floor(2 ** 32 / 10 ** WORKER_CODE_LENGTH) * 10 ** WORKER_CODE_LENGTH;

/**
 * A six-digit code from random bytes, read four at a time. A value at or
 * above the last whole multiple of a million is skipped, so no code is more
 * likely than another; the API passes enough bytes that running out does not
 * happen in practice.
 */
export function workerCodeFromBytes(bytes: Uint8Array): string {
  for (let offset = 0; offset + 4 <= bytes.length; offset += 4) {
    const value =
      bytes[offset]! * 2 ** 24 +
      bytes[offset + 1]! * 2 ** 16 +
      bytes[offset + 2]! * 2 ** 8 +
      bytes[offset + 3]!;
    if (value < UNBIASED_LIMIT) {
      return String(value % 10 ** WORKER_CODE_LENGTH).padStart(WORKER_CODE_LENGTH, '0');
    }
  }
  throw new RangeError('Not enough random bytes for a worker code');
}

/** What was typed, as the stored form, or null when it cannot be a code. */
export function normalizeWorkerCode(typed: string): string | null {
  const code = typed.replace(/[\s-]/g, '');
  return new RegExp(`^\\d{${WORKER_CODE_LENGTH}}$`).test(code) ? code : null;
}

/**
 * A phone number as `+<digits>`, or null when it cannot be one. Spaces,
 * hyphens, dots and brackets are ignored and `00` reads as `+`; eight digits
 * with no country code are a Cuban number (W-Login shows `+53` before the
 * field). Supplier profiles store numbers as typed, so both sides of a match
 * go through this.
 */
export function normalizeWorkerPhone(typed: string): string | null {
  let value = typed.trim().replace(/[\s().-]/g, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (value.startsWith('+')) {
    const digits = value.slice(1);
    return /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
  }
  if (!/^\d+$/.test(value)) return null;
  if (value.length === CUBA_NATIONAL_DIGITS) return `+${CUBA}${value}`;
  if (value.length === CUBA.length + CUBA_NATIONAL_DIGITS && value.startsWith(CUBA)) {
    return `+${value}`;
  }
  return null;
}

/**
 * A normalised number with two digits hidden, the way W-Login confirms where
 * the code went: `+53 5 241 •• 88` for a Cuban number.
 */
export function maskWorkerPhone(phone: string): string {
  const digits = phone.replace(/^\+/, '');
  if (digits.length === CUBA.length + CUBA_NATIONAL_DIGITS && digits.startsWith(CUBA)) {
    const national = digits.slice(CUBA.length);
    return `+${CUBA} ${national.slice(0, 1)} ${national.slice(1, 4)} •• ${national.slice(6)}`;
  }
  return `+${digits.slice(0, -4)} •• ${digits.slice(-2)}`;
}

/** When a code issued at this time stops working. */
export function workerCodeExpiresAt(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + WORKER_CODE_MINUTES * 60_000);
}

/** Whether another code may be sent by SMS, the open one having gone at `issuedAt`. */
export function workerCodeMayResend(issuedAt: Date, now: Date): boolean {
  return now.getTime() - issuedAt.getTime() >= WORKER_CODE_RESEND_SECONDS * 1000;
}

/** Whether a wrong try, bringing the count to this, voids the code. */
export function workerCodeFailureVoids(failedAttempts: number): boolean {
  return failedAttempts >= WORKER_CODE_MAX_FAILURES;
}

/** When the session a code opens at this time ends. */
export function workerSessionExpiresAt(signedInAt: Date): Date {
  return new Date(signedInAt.getTime() + WORKER_SESSION_DAYS * 24 * 60 * 60_000);
}

/**
 * The SMS that carries a code: one GSM-7 segment with no accents, and never
 * the word "reply" (ADR 0007 amendment A2).
 */
export function workerCodeSms(code: string): string {
  return `Vereda: tu codigo para entrar es ${code}. Caduca en ${WORKER_CODE_MINUTES} minutos. No lo compartas con nadie.`;
}

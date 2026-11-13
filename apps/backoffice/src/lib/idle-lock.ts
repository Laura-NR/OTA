// Client-safe: the login page, the lock and the API helper share it.

/** The API's code for a refusal of an idle-locked desk session (`docs/schema-m9-idle-lock.md`). */
export const SESSION_LOCKED_CODE = 'SESSION_LOCKED';

/** Dispatched on `window` when the API answers `SESSION_LOCKED`, so every tab locks. */
export const DESK_LOCKED_EVENT = 'ota:desk-locked';

/** Shared by the desk's tabs in this browser (L3, L7). */
export const IDLE_KEYS = {
  lastInput: 'ota-desk-last-input',
  lastReport: 'ota-desk-last-report',
  unlocked: 'ota-desk-unlocked',
  /** The login page's "This is my own device", remembered on this browser only (L1). */
  ownDevice: 'ota-desk-own-device',
} as const;

/** A stored time in ms, or null when absent or storage is unavailable. */
export function readStoredTime(key: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private windows and blocked storage: this tab still works on its own.
  }
}

/** Whether this browser was marked as the person's own device at sign-in. */
export function ownDeviceChosen(): boolean {
  try {
    return window.localStorage.getItem(IDLE_KEYS.ownDevice) === 'yes';
  } catch {
    return false;
  }
}

/**
 * A `SESSION_LOCKED` refusal, with the applied limit it names (null when the
 * body has none), or null for any other answer.
 */
export function lockedRefusal(body: unknown): { minutes: number | null } | null {
  if (!body || typeof body !== 'object') return null;
  const { code, idleLockMinutes } = body as { code?: unknown; idleLockMinutes?: unknown };
  if (code !== SESSION_LOCKED_CODE) return null;
  return { minutes: typeof idleLockMinutes === 'number' ? idleLockMinutes : null };
}

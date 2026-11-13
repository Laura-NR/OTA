import { isStaffRole } from './staff';

/**
 * The desk's idle lock (`docs/schema-m9-idle-lock.md` L1–L3). Pure: the API
 * reads the session's last reported input and its own-device choice, and the
 * desk decides when to lock its tabs and when to report input.
 */

/** Minutes with no input before a staff session locks (L6; the board's 30). */
export const STAFF_IDLE_LOCK_MINUTES = 30;

/** The desk reports input at most this often (L3). */
export const ACTIVITY_REPORT_INTERVAL_MS = 60 * 1000;

const MINUTE_MS = 60 * 1000;

/**
 * A staff session locks once the limit has passed since its last reported
 * input, or since sign-in when it never reported any. A session marked as
 * the person's own device never locks (L1); travelers and suppliers are not
 * staff and never lock.
 */
export function isStaffSessionLocked(input: {
  role: string | null | undefined;
  ownDevice: boolean | null | undefined;
  lastActiveAt: Date | null | undefined;
  signedInAt: Date;
  now: Date;
  minutes: number;
}): boolean {
  if (!isStaffRole(input.role) || input.ownDevice === true) return false;
  const since = input.lastActiveAt ?? input.signedInAt;
  return input.now.getTime() - since.getTime() > input.minutes * MINUTE_MS;
}

/** Minutes after sign-in in which the desk may mark the session as an own device (L1). */
export const OWN_DEVICE_WINDOW_MINUTES = 10;

/**
 * The own-device choice is made at sign-in, so the desk sends it within ten
 * minutes of the session's creation; later, the person signs in again.
 */
export function ownDeviceMayBeMarked(signedInAt: Date, now: Date): boolean {
  return now.getTime() - signedInAt.getTime() <= OWN_DEVICE_WINDOW_MINUTES * MINUTE_MS;
}

/** When the desk locks itself after the latest input it saw, in ms since the epoch. */
export function idleLockAt(lastInputAt: number, minutes: number): number {
  return lastInputAt + minutes * MINUTE_MS;
}

/**
 * Whether the desk should report input now: there was input since the last
 * report, and the last report is at least a minute old (L3).
 */
export function activityReportDue(input: {
  lastInputAt: number | null;
  lastReportedAt: number | null;
  now: number;
}): boolean {
  if (input.lastInputAt === null) return false;
  if (input.lastReportedAt === null) return true;
  return (
    input.lastInputAt > input.lastReportedAt &&
    input.now - input.lastReportedAt >= ACTIVITY_REPORT_INTERVAL_MS
  );
}

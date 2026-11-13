import { isStaffRole } from './staff';

/**
 * The new-device email (`docs/schema-m9-new-device-email.md` N1–N6). Pure: the
 * API keeps the device rows and the cookie; these rules name a device, say
 * when a known one is forgotten and when a sign-in sends the email.
 */

/** A known device unseen for this long is forgotten; its next sign-in is new (N2). */
export const KNOWN_DEVICE_STALE_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Checked in order: Edge and Opera also say "Chrome", and Chrome also says "Safari". */
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\b(?:OPR|Opera)\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/(?:Chrome|CriOS)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

/** iOS before macOS (an iPad can say "Mac OS X"), Android before Linux. */
const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\b(?:iPhone|iPad|iPod)\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
];

function firstMatch(
  userAgent: string,
  table: readonly (readonly [RegExp, string])[],
): string | null {
  return table.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
}

/**
 * A device's label from its user agent, such as "Firefox · Windows": the same
 * in every language, so the email and the audit row can show it as stored.
 * "—" when neither the browser nor the system is recognised.
 */
export function deviceLabel(userAgent: string | null | undefined): string {
  const parts = userAgent
    ? [firstMatch(userAgent, BROWSERS), firstMatch(userAgent, SYSTEMS)].filter(
        (part): part is string => part !== null,
      )
    : [];
  return parts.length > 0 ? parts.join(' · ') : '—';
}

/** Devices last seen before this are forgotten (N2). */
export function knownDeviceCutoff(now: Date): Date {
  return new Date(now.getTime() - KNOWN_DEVICE_STALE_DAYS * DAY_MS);
}

/** Whether a sign-in by this role records its device (N4: staff only). */
export function recordsSignInDevice(role: string | null | undefined): boolean {
  return isStaffRole(role);
}

/**
 * Whether a sign-in sends the new-device email (N3, N5): a staff member, from
 * a device not on file for them (or forgotten), while the switch is on. A
 * person's first device counts as new.
 */
export function newDeviceEmailDue(input: {
  role: string | null | undefined;
  known: boolean;
  enabled: boolean;
}): boolean {
  return input.enabled && !input.known && recordsSignInDevice(input.role);
}

/**
 * M3 consent log (`docs/schema-m3-compliance.md`, D4): rows are only ever
 * added, so a subject's current consent for a purpose is its latest row, and
 * a consent given to an older text version must be asked for again.
 */

export const CONSENT_PURPOSES = [
  'TERMS',
  'PRIVACY_NOTICE',
  'CANCELLATION_POLICY',
  'INSURANCE_ACKNOWLEDGEMENT',
  'PAYMENT_TERMS',
  'MARKETING_EMAIL',
  'TRIP_MESSAGES',
  'COOKIES_ANALYTICS',
  'COOKIES_MARKETING',
] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export interface ConsentEntry {
  purpose: ConsentPurpose;
  granted: boolean;
  textVersion: string;
  createdAt: Date;
}

/** The latest entry per purpose; a later withdrawal replaces an earlier grant. */
export function currentConsents<T extends ConsentEntry>(
  entries: readonly T[],
): Map<ConsentPurpose, T> {
  const current = new Map<ConsentPurpose, T>();
  for (const entry of entries) {
    const known = current.get(entry.purpose);
    if (!known || entry.createdAt.getTime() >= known.createdAt.getTime()) {
      current.set(entry.purpose, entry);
    }
  }
  return current;
}

/** True unless the subject's current entry grants this exact text version. */
export function needsConsent(
  current: ConsentEntry | undefined,
  textVersion: string,
): boolean {
  return !current || !current.granted || current.textVersion !== textVersion;
}

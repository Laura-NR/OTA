/**
 * M3 OFAC travel-category certification (`docs/schema-m3-compliance.md`):
 * who must certify, whether a typed signature matches the traveler, how long
 * the record is kept, and which travelers still block payment and vouchers.
 * Pure, so the rules are unit-tested without a database.
 */

import { addMonths } from '../retention/retention';

/** The twelve general-licence categories of 31 CFR 515.560(a). */
export const OFAC_CATEGORIES = [
  'FAMILY_VISITS',
  'OFFICIAL_GOVERNMENT_BUSINESS',
  'JOURNALISTIC_ACTIVITY',
  'PROFESSIONAL_RESEARCH',
  'EDUCATIONAL_ACTIVITIES',
  'RELIGIOUS_ACTIVITIES',
  'PUBLIC_PERFORMANCES',
  'SUPPORT_FOR_THE_CUBAN_PEOPLE',
  'HUMANITARIAN_PROJECTS',
  'PRIVATE_FOUNDATIONS_RESEARCH',
  'INFORMATIONAL_MATERIALS',
  'AUTHORIZED_EXPORT_TRANSACTIONS',
] as const;

export type OfacCategory = (typeof OFAC_CATEGORIES)[number];

/** Years an affidavit is kept after the trip ends (31 CFR 501.601; decision D6). */
export const OFAC_RETENTION_YEARS = 5;

export interface UsPersonInput {
  /** The desk's override; null derives the answer from the nationality (D3). */
  usPerson: boolean | null;
  nationality: string | null;
}

export function isUsPerson(traveler: UsPersonInput): boolean {
  return traveler.usPerson ?? traveler.nationality?.toUpperCase() === 'US';
}

/** Case, accents and repeated spaces do not count. */
export function foldName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * T-Forms `ofac_affidavit.signature`: the typed signature must equal the
 * traveler's full name, case-insensitive with accents folded.
 */
export function signatureMatches(signature: string, fullName: string): boolean {
  const typed = foldName(signature);
  return typed.length > 0 && typed === foldName(fullName);
}

export function affidavitRetainUntil(travelEnd: Date): Date {
  return addMonths(travelEnd, OFAC_RETENTION_YEARS * 12);
}

export interface GateTraveler extends UsPersonInput {
  id: string;
}

export interface GateAffidavit {
  travelerId: string | null;
}

export interface OfacGate {
  /** US persons on the booking. */
  required: string[];
  /** US persons with no affidavit yet; any entry blocks payment and vouchers. */
  missing: string[];
}

/** Which of a booking's travelers must certify, and which still have not (D3). */
export function ofacGate(
  travelers: readonly GateTraveler[],
  affidavits: readonly GateAffidavit[],
): OfacGate {
  const certified = new Set(affidavits.map((affidavit) => affidavit.travelerId));
  const required = travelers.filter(isUsPerson).map((traveler) => traveler.id);
  return { required, missing: required.filter((id) => !certified.has(id)) };
}

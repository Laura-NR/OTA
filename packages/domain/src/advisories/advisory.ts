import { ReservationStatus, UserRole } from '../reservation/status';

/**
 * M7 travel advisories (`docs/schema-m7-advisories.md`). The rules stay pure:
 * the API stores the advisory, its translations, approvals and
 * acknowledgements; these helpers decide who may approve and when it
 * publishes, its derived status, its active window, which bookings it reaches
 * and which translations it still needs.
 */

export const ADVISORY_SEVERITIES = ['INFO', 'CAUTION', 'CRITICAL'] as const;
export type AdvisorySeverity = (typeof ADVISORY_SEVERITIES)[number];

export const ADVISORY_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'PUBLISHED',
  'SUPERSEDED',
  'LIFTED',
] as const;
export type AdvisoryStatus = (typeof ADVISORY_STATUSES)[number];

/** The stored statuses plus the two derived on read (D2 of M7). */
export type AdvisoryDisplayStatus = AdvisoryStatus | 'SCHEDULED' | 'EXPIRED';

/** The roles whose approval counts (D4); support may read but not approve. */
export const ADVISORY_APPROVER_ROLES: readonly string[] = [
  UserRole.OperationsAdmin,
  UserRole.SuperAdmin,
];

/** How far ahead a trip may start and still be emailed (E-Advisory). */
export const ADVISORY_NOTICE_DAYS = 60;

/** The bookings whose travelers are emailed (D7). */
export const ADVISORY_AFFECTED_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.SecuredAndInvoiced,
  ReservationStatus.PendingPayment,
  ReservationStatus.Confirmed,
  ReservationStatus.InProgress,
];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AdvisoryApprovalVote {
  approverId: string;
  role: string;
}

/** What a pending advisory still waits for. */
export type AdvisoryApprovalNeed = 'APPROVER' | 'OPERATIONS_ADMIN' | 'SUPER_ADMIN';

export type AdvisoryApprovalDecision =
  { state: 'PUBLISH' } | { state: 'PENDING'; missing: AdvisoryApprovalNeed[] };

/**
 * Where an advisory stands after its approvals (D4). INFO and CAUTION publish
 * on one Operations Admin or Super Admin approval. CRITICAL needs an Operations
 * Admin and a Super Admin, two different people, and publishes on the second.
 */
export function advisoryApprovalDecision(
  severity: AdvisorySeverity,
  votes: readonly AdvisoryApprovalVote[],
): AdvisoryApprovalDecision {
  const counted = votes.filter((vote) => ADVISORY_APPROVER_ROLES.includes(vote.role));
  if (severity !== 'CRITICAL') {
    return counted.length > 0
      ? { state: 'PUBLISH' }
      : { state: 'PENDING', missing: ['APPROVER'] };
  }
  const operations = counted.filter((vote) => vote.role === UserRole.OperationsAdmin);
  const supers = counted.filter((vote) => vote.role === UserRole.SuperAdmin);
  const paired = operations.some((op) =>
    supers.some((sup) => sup.approverId !== op.approverId),
  );
  if (paired) {
    return { state: 'PUBLISH' };
  }
  const missing: AdvisoryApprovalNeed[] = [];
  if (operations.length === 0) missing.push('OPERATIONS_ADMIN');
  if (supers.length === 0) missing.push('SUPER_ADMIN');
  return { state: 'PENDING', missing };
}

export type AdvisoryApprovalRefusal =
  'ROLE' | 'ALREADY_APPROVED' | 'ROLE_ALREADY_APPROVED';

/**
 * Why this person's approval cannot be added, or null. A support role never
 * approves; nobody approves twice; on a CRITICAL advisory a second approval
 * from the role already given would not move it, so it is refused rather than
 * recorded as if it counted.
 */
export function advisoryApprovalRefusal(
  severity: AdvisorySeverity,
  votes: readonly AdvisoryApprovalVote[],
  next: AdvisoryApprovalVote,
): AdvisoryApprovalRefusal | null {
  if (!ADVISORY_APPROVER_ROLES.includes(next.role)) {
    return 'ROLE';
  }
  if (votes.some((vote) => vote.approverId === next.approverId)) {
    return 'ALREADY_APPROVED';
  }
  if (severity === 'CRITICAL' && votes.some((vote) => vote.role === next.role)) {
    return 'ROLE_ALREADY_APPROVED';
  }
  return null;
}

/**
 * The status the desk and travelers see: a published advisory is Scheduled
 * before `effectiveFrom` and Expired from `expiresAt`; the rest are stored.
 */
export function advisoryDisplayStatus(
  status: AdvisoryStatus,
  effectiveFrom: Date,
  expiresAt: Date,
  now: Date,
): AdvisoryDisplayStatus {
  if (status !== 'PUBLISHED') {
    return status;
  }
  if (now.getTime() < effectiveFrom.getTime()) {
    return 'SCHEDULED';
  }
  if (now.getTime() >= expiresAt.getTime()) {
    return 'EXPIRED';
  }
  return 'PUBLISHED';
}

/** Published and inside its window: what the banner and the notices show. */
export function isAdvisoryActive(
  status: AdvisoryStatus,
  effectiveFrom: Date,
  expiresAt: Date,
  now: Date,
): boolean {
  return advisoryDisplayStatus(status, effectiveFrom, expiresAt, now) === 'PUBLISHED';
}

export type AdvisoryWindowIssue = 'EXPIRES_BEFORE_START' | 'ALREADY_EXPIRED';

/**
 * The window's problem, or null. The end date is mandatory and after the
 * start; an advisory that would publish already expired is refused.
 */
export function advisoryWindowIssue(
  effectiveFrom: Date,
  expiresAt: Date,
  now: Date,
): AdvisoryWindowIssue | null {
  if (expiresAt.getTime() <= effectiveFrom.getTime()) {
    return 'EXPIRES_BEFORE_START';
  }
  if (expiresAt.getTime() <= now.getTime()) {
    return 'ALREADY_EXPIRED';
  }
  return null;
}

/** An empty region list is the whole country (D3). */
export function advisoryCoversProvinces(
  regions: readonly string[],
  provinces: readonly string[],
): boolean {
  return regions.length === 0 || provinces.some((code) => regions.includes(code));
}

/**
 * The locales still missing before publishing (D6): the source locale always,
 * and for CRITICAL every tenant locale. INFO and CAUTION fall back to the
 * source text in the other languages.
 */
export function advisoryMissingTranslations(
  severity: AdvisorySeverity,
  sourceLocale: string,
  present: readonly string[],
  tenantLocales: readonly string[],
): string[] {
  const required =
    severity === 'CRITICAL'
      ? [...new Set([sourceLocale, ...tenantLocales])]
      : [sourceLocale];
  return required.filter((locale) => !present.includes(locale));
}

/** The translation for a locale, else the source locale's, else none. */
export function pickAdvisoryTranslation<T extends { locale: string }>(
  translations: readonly T[],
  locale: string,
  sourceLocale: string,
): T | null {
  return (
    translations.find((item) => item.locale === locale) ??
    translations.find((item) => item.locale === sourceLocale) ??
    null
  );
}

export interface AdvisoryReach {
  severity: AdvisorySeverity;
  regions: readonly string[];
  effectiveFrom: Date;
  expiresAt: Date;
  notifyTravelers: boolean;
}

export interface AdvisoryBooking {
  reservationId: string;
  userId: string;
  status: string;
  /** The trip's first and last calendar days (UTC midnight). */
  startDate: Date;
  endDate: Date;
  /** The province codes its package and services visit. */
  provinces: readonly string[];
}

/**
 * Whether an advisory's email reaches this booking (D7): CAUTION or CRITICAL
 * with traveler notification on; a booking in a secured status; a trip that
 * starts within 60 days or is under way and overlaps the advisory's window;
 * and a province in its regions (or a whole-country advisory). INFO is site
 * only.
 */
export function advisoryReachesBooking(
  advisory: AdvisoryReach,
  booking: AdvisoryBooking,
  now: Date,
): boolean {
  if (advisory.severity === 'INFO' || !advisory.notifyTravelers) {
    return false;
  }
  if (!ADVISORY_AFFECTED_STATUSES.includes(booking.status as ReservationStatus)) {
    return false;
  }
  const tripStart = booking.startDate.getTime();
  // The last day counts in full: the trip is under way until the next midnight.
  const tripEnd = booking.endDate.getTime() + DAY_MS;
  if (tripStart > now.getTime() + ADVISORY_NOTICE_DAYS * DAY_MS) return false;
  if (tripEnd <= now.getTime()) return false;
  if (tripEnd <= advisory.effectiveFrom.getTime()) return false;
  if (tripStart >= advisory.expiresAt.getTime()) return false;
  return advisoryCoversProvinces(advisory.regions, booking.provinces);
}

export interface AdvisoryRecipient {
  userId: string;
  /** The traveler's reached bookings, earliest first. */
  reservationIds: string[];
}

/** One recipient per traveler, however many of their bookings it reaches. */
export function advisoryRecipients(
  advisory: AdvisoryReach,
  bookings: readonly AdvisoryBooking[],
  now: Date,
): AdvisoryRecipient[] {
  const byUser = new Map<string, AdvisoryBooking[]>();
  for (const booking of bookings) {
    if (!advisoryReachesBooking(advisory, booking, now)) continue;
    byUser.set(booking.userId, [...(byUser.get(booking.userId) ?? []), booking]);
  }
  return [...byUser.entries()].map(([userId, reached]) => ({
    userId,
    reservationIds: [...reached]
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .map((booking) => booking.reservationId),
  }));
}

/** The visible reference of a year's n-th advisory: `ADV-2026-031`. */
export function advisoryReference(year: number, sequence: number): string {
  return `ADV-${year}-${String(sequence).padStart(3, '0')}`;
}

/**
 * A new version's reference (D2): `ADV-2026-031` → `ADV-2026-031-2` →
 * `ADV-2026-031-3`, so every version of one advisory shares its stem.
 */
export function advisoryVersionReference(previous: string): string {
  const versioned = /^(ADV-\d{4}-\d+)-(\d+)$/.exec(previous);
  return versioned ? `${versioned[1]}-${Number(versioned[2]) + 1}` : `${previous}-2`;
}

const SEVERITY_RANK: Record<AdvisorySeverity, number> = {
  CRITICAL: 0,
  CAUTION: 1,
  INFO: 2,
};

/** Most severe first, then the most recently effective. */
export function compareAdvisories(
  a: { severity: AdvisorySeverity; effectiveFrom: Date },
  b: { severity: AdvisorySeverity; effectiveFrom: Date },
): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    b.effectiveFrom.getTime() - a.effectiveFrom.getTime()
  );
}

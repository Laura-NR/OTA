import { ADVISORY_AFFECTED_STATUSES } from '../advisories/advisory';
import type { ReservationStatus } from '../reservation/status';

/**
 * M8 disruption cases (`docs/schema-m8-disruptions.md`). The rules stay pure:
 * the API stores the case, its steps, options and attached bookings; these
 * helpers derive what is never written by a job — the effective choice after
 * the deadline (D4), the red "Unknown" on the status board (D6), the bookings
 * a case suggests (D2) and the case's counts.
 */

export const DISRUPTION_SEVERITIES = ['MINOR', 'MAJOR', 'EMERGENCY'] as const;
export type DisruptionSeverity = (typeof DISRUPTION_SEVERITIES)[number];

export const DISRUPTION_STATUSES = ['OPEN', 'CLOSED'] as const;
export type DisruptionStatus = (typeof DISRUPTION_STATUSES)[number];

export const TRAVELER_SAFETY_STATES = ['UNKNOWN', 'SAFE', 'NEEDS_HELP'] as const;
export type TravelerSafety = (typeof TRAVELER_SAFETY_STATES)[number];

export const DISRUPTION_CHOICE_SOURCES = ['TRAVELER', 'DESK', 'DEFAULT'] as const;
export type DisruptionChoiceSource = (typeof DISRUPTION_CHOICE_SOURCES)[number];

export const DISRUPTION_OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
export type DisruptionOptionKey = (typeof DISRUPTION_OPTION_KEYS)[number];

/** The bookings a case suggests: the same secured statuses an advisory reaches. */
export const DISRUPTION_SUGGESTED_STATUSES: readonly ReservationStatus[] =
  ADVISORY_AFFECTED_STATUSES;

/** How far ahead an arriving trip is suggested and counted (D2). */
export const DISRUPTION_ARRIVAL_HOURS = 72;

/**
 * Hours without contact before "Unknown" turns red (D6). A minor case has no
 * timer: the desk contacts its travelers once.
 */
export const UNKNOWN_RED_HOURS: Readonly<Record<DisruptionSeverity, number | null>> = {
  MINOR: null,
  MAJOR: 4,
  EMERGENCY: 1,
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The visible reference of the n-th case: `DC-0931`. */
export function disruptionReference(sequence: number): string {
  return `DC-${String(sequence).padStart(4, '0')}`;
}

export interface DisruptionSafetyState {
  safety: TravelerSafety;
  /** The last time the party was reached; null when never. */
  lastContactAt: Date | null;
  /** When the booking was attached: the clock starts there without a contact. */
  attachedAt: Date;
}

/**
 * Whether an "Unknown" row shows red (D6): 4 h without contact on a major
 * case, 1 h on an emergency, measured from the last contact or, with none,
 * from the attachment. Derived on read, so a severity change applies at once.
 */
export function isUnknownOverdue(
  severity: DisruptionSeverity,
  state: DisruptionSafetyState,
  now: Date,
): boolean {
  const hours = UNKNOWN_RED_HOURS[severity];
  if (state.safety !== 'UNKNOWN' || hours === null) {
    return false;
  }
  const since = (state.lastContactAt ?? state.attachedAt).getTime();
  return now.getTime() - since >= hours * HOUR_MS;
}

export interface DisruptionOffer {
  offerSentAt: Date | null;
  offerDeadline: Date | null;
  defaultOptionKey: string | null;
  chosenOptionKey: string | null;
  choiceSource: DisruptionChoiceSource | null;
  chosenAt: Date | null;
}

/**
 * Where a booking's offer stands: not sent; awaiting an answer before the
 * deadline; chosen (recorded by the traveler or the desk); or defaulted — the
 * deadline passed with nothing recorded, so the default stands and the desk
 * calls (D4).
 */
export type DisruptionOfferState = 'NOT_SENT' | 'AWAITING' | 'CHOSEN' | 'DEFAULTED';

export function disruptionOfferState(
  offer: DisruptionOffer,
  now: Date,
): DisruptionOfferState {
  if (offer.offerSentAt === null) {
    return 'NOT_SENT';
  }
  if (offer.chosenOptionKey !== null) {
    return 'CHOSEN';
  }
  if (offer.offerDeadline !== null && now.getTime() >= offer.offerDeadline.getTime()) {
    return 'DEFAULTED';
  }
  return 'AWAITING';
}

export interface EffectiveChoice {
  key: string;
  source: DisruptionChoiceSource;
  /** True when no one recorded it: the default after the deadline, on read. */
  derived: boolean;
}

/**
 * The option that applies now (D4): the recorded choice, else the default once
 * the deadline has passed, else none. Nothing writes the default; the desk may
 * record it when it confirms by phone.
 */
export function effectiveChoice(
  offer: DisruptionOffer,
  now: Date,
): EffectiveChoice | null {
  const state = disruptionOfferState(offer, now);
  if (state === 'CHOSEN' && offer.chosenOptionKey !== null) {
    return {
      key: offer.chosenOptionKey,
      source: offer.choiceSource ?? 'DESK',
      derived: false,
    };
  }
  if (state === 'DEFAULTED' && offer.defaultOptionKey !== null) {
    return { key: offer.defaultOptionKey, source: 'DEFAULT', derived: true };
  }
  return null;
}

/** On the desk's "call now" list: the deadline passed with no answer recorded. */
export function needsCall(offer: DisruptionOffer, now: Date): boolean {
  return disruptionOfferState(offer, now) === 'DEFAULTED';
}

export type TravelerChoiceRefusal =
  'CASE_CLOSED' | 'NOT_OFFERED' | 'DEADLINE_PASSED' | 'ALREADY_CHOSEN' | 'UNKNOWN_OPTION';

/**
 * Why the traveler cannot choose online, or null. One answer per offer, before
 * the deadline, on an open case; a change after that goes through the desk,
 * which may already be acting on the first answer (D5).
 */
export function travelerChoiceRefusal(
  caseStatus: DisruptionStatus,
  offer: DisruptionOffer,
  optionKeys: readonly string[],
  key: string,
  now: Date,
): TravelerChoiceRefusal | null {
  if (caseStatus !== 'OPEN') return 'CASE_CLOSED';
  const state = disruptionOfferState(offer, now);
  if (state === 'NOT_SENT') return 'NOT_OFFERED';
  if (state === 'CHOSEN') return 'ALREADY_CHOSEN';
  if (state === 'DEFAULTED') return 'DEADLINE_PASSED';
  if (!optionKeys.includes(key)) return 'UNKNOWN_OPTION';
  return null;
}

export type DeskChoiceRefusal =
  | 'CASE_CLOSED'
  | 'NOT_OFFERED'
  | 'UNKNOWN_OPTION'
  | 'NOT_DEFAULT'
  | 'DEADLINE_NOT_PASSED';

/**
 * Why the desk cannot record this answer, or null. The desk records a phone
 * answer at any time on an open case (source DESK); confirming the default
 * (source DEFAULT) is only the default option, once the deadline has passed.
 */
export function deskChoiceRefusal(
  caseStatus: DisruptionStatus,
  offer: DisruptionOffer,
  optionKeys: readonly string[],
  key: string,
  source: 'DESK' | 'DEFAULT',
  now: Date,
): DeskChoiceRefusal | null {
  if (caseStatus !== 'OPEN') return 'CASE_CLOSED';
  if (offer.offerSentAt === null) return 'NOT_OFFERED';
  if (!optionKeys.includes(key)) return 'UNKNOWN_OPTION';
  if (source === 'DEFAULT') {
    if (key !== offer.defaultOptionKey) return 'NOT_DEFAULT';
    if (offer.offerDeadline === null || now.getTime() < offer.offerDeadline.getTime()) {
      return 'DEADLINE_NOT_PASSED';
    }
  }
  return null;
}

export interface DisruptionTrip {
  reservationId: string;
  status: string;
  /** The trip's first and last calendar days (UTC midnight). */
  startDate: Date;
  endDate: Date;
  /** The province codes its package and services visit. */
  provinces: readonly string[];
}

/** Under way: from the first day until the midnight after the last. */
export function isTripUnderWay(
  trip: Pick<DisruptionTrip, 'startDate' | 'endDate'>,
  now: Date,
): boolean {
  return (
    trip.startDate.getTime() <= now.getTime() &&
    now.getTime() < trip.endDate.getTime() + DAY_MS
  );
}

/** Starts after now and within the next 72 h. */
export function isTripArriving(
  trip: Pick<DisruptionTrip, 'startDate'>,
  now: Date,
): boolean {
  const start = trip.startDate.getTime();
  return (
    start > now.getTime() && start <= now.getTime() + DISRUPTION_ARRIVAL_HOURS * HOUR_MS
  );
}

/**
 * The bookings a case suggests attaching (D2): secured, visiting the case's
 * province, and under way or starting within 72 h; earliest first. A case
 * with no province (a flight) suggests nothing: the desk attaches by code.
 */
export function suggestDisruptionBookings<T extends DisruptionTrip>(
  province: string | null,
  trips: readonly T[],
  attached: readonly string[],
  now: Date,
): T[] {
  if (province === null) {
    return [];
  }
  return trips
    .filter(
      (trip) =>
        !attached.includes(trip.reservationId) &&
        DISRUPTION_SUGGESTED_STATUSES.includes(trip.status as ReservationStatus) &&
        trip.provinces.includes(province) &&
        (isTripUnderWay(trip, now) || isTripArriving(trip, now)),
    )
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

export interface DisruptionCaseRow extends DisruptionSafetyState, DisruptionOffer {
  startDate: Date;
  endDate: Date;
}

export interface DisruptionCaseCounts {
  affected: number;
  onTheGround: number;
  arriving: number;
  safe: number;
  needsHelp: number;
  unknown: number;
  /** Unknown rows past the severity's contact timer. */
  overdueUnknown: number;
  /** Offers past their deadline with no answer recorded. */
  callNow: number;
}

/** The figures the case header and the dashboard alert show. */
export function disruptionCaseCounts(
  severity: DisruptionSeverity,
  rows: readonly DisruptionCaseRow[],
  now: Date,
): DisruptionCaseCounts {
  return {
    affected: rows.length,
    onTheGround: rows.filter((row) => isTripUnderWay(row, now)).length,
    arriving: rows.filter((row) => isTripArriving(row, now)).length,
    safe: rows.filter((row) => row.safety === 'SAFE').length,
    needsHelp: rows.filter((row) => row.safety === 'NEEDS_HELP').length,
    unknown: rows.filter((row) => row.safety === 'UNKNOWN').length,
    overdueUnknown: rows.filter((row) => isUnknownOverdue(severity, row, now)).length,
    callNow: rows.filter((row) => needsCall(row, now)).length,
  };
}

export type SendOptionsIssue =
  'CASE_CLOSED' | 'NO_OPTIONS' | 'UNKNOWN_DEFAULT' | 'DEADLINE_PAST';

/**
 * Why the options cannot be sent, or null: the case is open, it has options,
 * the default is one of them and the deadline is still ahead.
 */
export function sendOptionsIssue(
  caseStatus: DisruptionStatus,
  optionKeys: readonly string[],
  defaultKey: string,
  deadline: Date,
  now: Date,
): SendOptionsIssue | null {
  if (caseStatus !== 'OPEN') return 'CASE_CLOSED';
  if (optionKeys.length === 0) return 'NO_OPTIONS';
  if (!optionKeys.includes(defaultKey)) return 'UNKNOWN_DEFAULT';
  if (deadline.getTime() <= now.getTime()) return 'DEADLINE_PAST';
  return null;
}

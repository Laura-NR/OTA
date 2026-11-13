/**
 * GDPR retention lifecycle (spec §3.5). Pure scheduling arithmetic, so the
 * trigger/grace/extension rules are unit-tested without a database or a clock.
 *
 * Timeline (the defaults; M9 makes the trigger and the grace runtime settings):
 *   6 months after the latest COMPLETED booking  -> send the keep-alive notice
 *   7 days before the deadline, with no consent  -> send the one reminder (day 23)
 *   30 days after the notice, with no consent    -> anonymize the traveler
 *   consent confirmed                             -> extend the account 12 months
 */

/** Months after the latest completion before the keep-alive notice is sent. */
export const RETENTION_TRIGGER_MONTHS = 6;
/** Days the traveler has to confirm before the record is anonymized. */
export const RETENTION_GRACE_DAYS = 30;
/** Months the account is kept after a keep-alive confirmation. */
export const RETENTION_EXTENSION_MONTHS = 12;
/** Days after the notice when its one reminder goes out (E-Retention: a week left). */
export const RETENTION_REMINDER_DAYS = 23;
/** The reminder goes out this many days before the purge deadline. */
export const RETENTION_REMINDER_LEAD_DAYS =
  RETENTION_GRACE_DAYS - RETENTION_REMINDER_DAYS;

/** The two clocks M9 makes runtime settings; the constants above are the defaults. */
export interface RetentionPolicy {
  triggerMonths: number;
  graceDays: number;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  triggerMonths: RETENTION_TRIGGER_MONTHS,
  graceDays: RETENTION_GRACE_DAYS,
};

export interface RetentionClock {
  /** When the traveler's latest reservation reached COMPLETED. */
  latestCompletedAt: Date | null;
  /** When the keep-alive notice was last sent. */
  noticeSentAt: Date | null;
  /** When the traveler last confirmed they want to keep the account. */
  consentGrantedAt: Date | null;
  /** When the traveler was anonymized; set once and stops all further action. */
  anonymizedAt: Date | null;
}

export type RetentionStatus =
  'ACTIVE' | 'NOTICE_DUE' | 'GRACE_PERIOD' | 'PURGE_DUE' | 'ANONYMIZED';

/**
 * Add calendar months, clamping the day to the target month's length so that
 * (for example) 31 January + 1 month is 28/29 February, not 3 March.
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * The start and length of the current retention cycle. Once the traveler
 * confirms, the next cycle runs 12 months from that confirmation; otherwise it
 * runs the policy's trigger months (6 by default) from the latest completion.
 */
function currentCycle(
  clock: RetentionClock,
  policy: RetentionPolicy,
): { start: Date; months: number } | null {
  if (!clock.latestCompletedAt) {
    return null;
  }
  if (clock.consentGrantedAt && clock.consentGrantedAt > clock.latestCompletedAt) {
    return { start: clock.consentGrantedAt, months: RETENTION_EXTENSION_MONTHS };
  }
  return { start: clock.latestCompletedAt, months: policy.triggerMonths };
}

/** When a notice sent at the given time stops being confirmable. */
export function retentionPurgeAt(
  noticeSentAt: Date,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): Date {
  return addDays(noticeSentAt, policy.graceDays);
}

/**
 * True when the traveler is due the keep-alive notice: the current cycle has
 * elapsed and no notice has been sent during it yet.
 */
export function isRetentionNoticeDue(
  clock: RetentionClock,
  now: Date,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): boolean {
  if (clock.anonymizedAt) {
    return false;
  }
  const cycle = currentCycle(clock, policy);
  if (!cycle) {
    return false;
  }
  if (now < addMonths(cycle.start, cycle.months)) {
    return false;
  }
  return !(clock.noticeSentAt && clock.noticeSentAt >= cycle.start);
}

/**
 * True during the last week of the grace period when the traveler has not
 * confirmed: the notice's one reminder is due (the scan sends it once).
 */
export function isRetentionReminderDue(
  clock: RetentionClock,
  now: Date,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): boolean {
  if (clock.anonymizedAt || !clock.noticeSentAt) {
    return false;
  }
  if (clock.consentGrantedAt && clock.consentGrantedAt >= clock.noticeSentAt) {
    return false;
  }
  return (
    now >= addDays(clock.noticeSentAt, policy.graceDays - RETENTION_REMINDER_LEAD_DAYS) &&
    now < retentionPurgeAt(clock.noticeSentAt, policy)
  );
}

/**
 * True when the grace period has elapsed with no confirmation after the notice:
 * the record should be anonymized.
 */
export function isRetentionPurgeDue(
  clock: RetentionClock,
  now: Date,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): boolean {
  if (clock.anonymizedAt || !clock.noticeSentAt) {
    return false;
  }
  if (clock.consentGrantedAt && clock.consentGrantedAt >= clock.noticeSentAt) {
    return false;
  }
  return now >= retentionPurgeAt(clock.noticeSentAt, policy);
}

/** A single label describing where a traveler sits in the lifecycle. */
export function retentionStatus(
  clock: RetentionClock,
  now: Date,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): RetentionStatus {
  if (clock.anonymizedAt) {
    return 'ANONYMIZED';
  }
  if (clock.noticeSentAt) {
    const confirmed =
      clock.consentGrantedAt && clock.consentGrantedAt >= clock.noticeSentAt;
    if (!confirmed) {
      return now >= retentionPurgeAt(clock.noticeSentAt, policy)
        ? 'PURGE_DUE'
        : 'GRACE_PERIOD';
    }
  }
  if (isRetentionNoticeDue(clock, now, policy)) {
    return 'NOTICE_DUE';
  }
  return 'ACTIVE';
}

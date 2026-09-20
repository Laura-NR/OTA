/**
 * Dispatch timeout and escalation policy (spec §4.3).
 *
 * Standard bookings allow 2 hours for every worker to accept. Bookings made
 * within 48 hours of arrival get a compressed 30 minute window.
 */
export const DEFAULT_DISPATCH_TIMEOUT_MS = 2 * 60 * 60 * 1000;
export const SHORT_NOTICE_DISPATCH_TIMEOUT_MS = 30 * 60 * 1000;
export const SHORT_NOTICE_WINDOW_MS = 48 * 60 * 60 * 1000;
export const AMBER_THRESHOLD = 0.75;

export type EscalationAlert = 'NONE' | 'AMBER' | 'RED';

export interface DispatchClock {
  now: Date;
  arrivalAt: Date;
}

/**
 * Resolve the dispatch timeout for a booking created now, based on how far away
 * arrival is.
 */
export function resolveDispatchTimeoutMs({ now, arrivalAt }: DispatchClock): number {
  const msUntilArrival = arrivalAt.getTime() - now.getTime();
  return msUntilArrival <= SHORT_NOTICE_WINDOW_MS
    ? SHORT_NOTICE_DISPATCH_TIMEOUT_MS
    : DEFAULT_DISPATCH_TIMEOUT_MS;
}

export interface EscalationInput {
  offeredAt: Date;
  deadline: Date;
  now: Date;
  /** A worker explicitly declining forces a red alert regardless of the clock. */
  declined?: boolean;
}

/**
 * Where the offer sits against its deadline: silent, amber (>=75% elapsed), or
 * red (100% elapsed or declined).
 */
export function escalationAlert({
  offeredAt,
  deadline,
  now,
  declined = false,
}: EscalationInput): EscalationAlert {
  if (declined) {
    return 'RED';
  }

  const total = deadline.getTime() - offeredAt.getTime();
  if (total <= 0) {
    return 'RED';
  }

  const ratio = (now.getTime() - offeredAt.getTime()) / total;
  if (ratio >= 1) {
    return 'RED';
  }
  if (ratio >= AMBER_THRESHOLD) {
    return 'AMBER';
  }
  return 'NONE';
}

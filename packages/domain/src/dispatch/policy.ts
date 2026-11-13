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

/** The timers as M9 settings give them; the constants above are the defaults. */
export interface DispatchTimers {
  standardMs: number;
  shortNoticeMs: number;
  shortNoticeWindowMs: number;
}

export type EscalationAlert = 'NONE' | 'AMBER' | 'RED';

export interface DispatchClock {
  now: Date;
  arrivalAt: Date;
  /** The operating timers (M9); today's constants when omitted. */
  timers?: DispatchTimers;
}

/**
 * Resolve the dispatch timeout for a booking created now, based on how far away
 * arrival is.
 */
export function resolveDispatchTimeoutMs({
  now,
  arrivalAt,
  timers,
}: DispatchClock): number {
  const msUntilArrival = arrivalAt.getTime() - now.getTime();
  return msUntilArrival <= (timers?.shortNoticeWindowMs ?? SHORT_NOTICE_WINDOW_MS)
    ? (timers?.shortNoticeMs ?? SHORT_NOTICE_DISPATCH_TIMEOUT_MS)
    : (timers?.standardMs ?? DEFAULT_DISPATCH_TIMEOUT_MS);
}

export interface EscalationInput {
  offeredAt: Date;
  deadline: Date;
  now: Date;
  /** A worker explicitly declining forces a red alert regardless of the clock. */
  declined?: boolean;
  /** The share of the timer that turns amber (M9); 0.75 when omitted. */
  amberThreshold?: number;
}

/**
 * Where the offer sits against its deadline: silent, amber (from the amber
 * threshold, 75 % by default), or red (100% elapsed or declined).
 */
export function escalationAlert({
  offeredAt,
  deadline,
  now,
  declined = false,
  amberThreshold = AMBER_THRESHOLD,
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
  if (ratio >= amberThreshold) {
    return 'AMBER';
  }
  return 'NONE';
}

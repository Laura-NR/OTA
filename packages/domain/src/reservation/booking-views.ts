import type { EscalationAlert } from '../dispatch/policy';
import { zonedCalendarDay } from '../time/ops-calendar';
import { ReservationStatus } from './status';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A-Bookings' "Travel date" filter. */
export const TRAVEL_WINDOWS = ['next30', 'next90', 'thisMonth', 'past'] as const;

export type TravelWindow = (typeof TRAVEL_WINDOWS)[number];

export interface BookingDates {
  /** Calendar dates at UTC midnight, as bookings store them. */
  startDate: Date;
  endDate: Date;
}

/**
 * Whether a booking falls in a travel-date window. "Today" is the desk's
 * (Havana) calendar day: the next 30 or 90 days count bookings that start from
 * today to that many days ahead, "this month" those starting in today's month,
 * "past" those that ended before today.
 */
export function inTravelWindow(
  { startDate, endDate }: BookingDates,
  window: TravelWindow,
  now: Date,
): boolean {
  const today = zonedCalendarDay(now);
  const start = startDate.getTime();
  switch (window) {
    case 'next30':
    case 'next90': {
      const days = window === 'next30' ? 30 : 90;
      return start >= today.getTime() && start <= today.getTime() + days * DAY_MS;
    }
    case 'thisMonth':
      return (
        startDate.getUTCFullYear() === today.getUTCFullYear() &&
        startDate.getUTCMonth() === today.getUTCMonth()
      );
    case 'past':
      return endDate.getTime() < today.getTime();
  }
}

const FINISHED: readonly ReservationStatus[] = [
  ReservationStatus.Completed,
  ReservationStatus.Cancelled,
];

/**
 * A-Bookings' "Arriving ≤ 7 days": a live booking that starts today or within
 * the next `days` days.
 */
export function isArrivingWithin(
  startDate: Date,
  status: ReservationStatus,
  now: Date,
  days = 7,
): boolean {
  if (FINISHED.includes(status)) {
    return false;
  }
  const today = zonedCalendarDay(now).getTime();
  const start = startDate.getTime();
  return start >= today && start <= today + days * DAY_MS;
}

export interface BookingUrgency {
  /** The booking's worst open alert from dispatch. */
  alert: EscalationAlert;
  /** The soonest deadline of an open offer, if any. */
  deadline: Date | null;
  startDate: Date;
}

const ALERT_RANK: Record<EscalationAlert, number> = { RED: 0, AMBER: 1, NONE: 2 };

/**
 * A-Bookings' order, "most urgent first": red, then amber, then the soonest
 * offer deadline, then the soonest start.
 */
export function compareUrgency(a: BookingUrgency, b: BookingUrgency): number {
  const byAlert = ALERT_RANK[a.alert] - ALERT_RANK[b.alert];
  if (byAlert !== 0) return byAlert;
  const aDeadline = a.deadline?.getTime() ?? Number.POSITIVE_INFINITY;
  const bDeadline = b.deadline?.getTime() ?? Number.POSITIVE_INFINITY;
  if (aDeadline !== bDeadline) return aDeadline < bDeadline ? -1 : 1;
  return a.startDate.getTime() - b.startDate.getTime();
}

/** A booking's path on the desk (A-Booking's timeline), from request to trip end. */
export const BOOKING_PIPELINE = [
  ReservationStatus.ItinerarySubmitted,
  ReservationStatus.DispatchInProgress,
  ReservationStatus.AssemblyAndEscalation,
  ReservationStatus.SecuredAndInvoiced,
  ReservationStatus.PendingPayment,
  ReservationStatus.Confirmed,
  ReservationStatus.InProgress,
  ReservationStatus.Completed,
] as const;

export interface PipelinePosition {
  /** Index into BOOKING_PIPELINE of the current step; -1 before submission. */
  index: number;
  /** The booking waits on the desk at this step (ACTION_REQUIRED). */
  blocked: boolean;
  /** Every step is done. */
  finished: boolean;
}

/**
 * Where a booking stands on BOOKING_PIPELINE. ACTION_REQUIRED holds it at
 * dispatch, blocked; a draft has not started; a cancelled booking is off the
 * path (null).
 */
export function pipelinePosition(status: ReservationStatus): PipelinePosition | null {
  if (status === ReservationStatus.Cancelled) {
    return null;
  }
  if (status === ReservationStatus.ActionRequired) {
    return { index: 1, blocked: true, finished: false };
  }
  if (status === ReservationStatus.Draft) {
    return { index: -1, blocked: false, finished: false };
  }
  return {
    index: (BOOKING_PIPELINE as readonly ReservationStatus[]).indexOf(status),
    blocked: false,
    finished: status === ReservationStatus.Completed,
  };
}

import { ReservationStatus } from './status';

/**
 * The traveler-facing status vocabulary (DS 03 "One vocabulary, traveler and
 * admin"): what a traveler is told about a booking, in the same words on every
 * screen, email and message. Several system states share one label, so a
 * traveler never sees the internal pipeline; admin screens keep the system
 * state itself.
 *
 * DS 03 also draws "Travel ready" (confirmed, with passport, insurance and
 * e-visa checked), "Waitlisted" and "Refunded"; none has data behind it yet, so
 * they are not mapped. `draft` covers a booking an operator has started and
 * not submitted, which DS 03 does not name.
 */
export const TravelerStatus = {
  Draft: 'draft',
  RequestReceived: 'requestReceived',
  ConfirmingWithHosts: 'confirmingWithHosts',
  ActionNeeded: 'actionNeeded',
  ReadyToPay: 'readyToPay',
  Confirmed: 'confirmed',
  OnTrip: 'onTrip',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const;

export type TravelerStatus = (typeof TravelerStatus)[keyof typeof TravelerStatus];

const BY_RESERVATION_STATUS: Readonly<Record<ReservationStatus, TravelerStatus>> = {
  [ReservationStatus.Draft]: TravelerStatus.Draft,
  [ReservationStatus.ItinerarySubmitted]: TravelerStatus.RequestReceived,
  [ReservationStatus.DispatchInProgress]: TravelerStatus.ConfirmingWithHosts,
  [ReservationStatus.AssemblyAndEscalation]: TravelerStatus.ConfirmingWithHosts,
  [ReservationStatus.ActionRequired]: TravelerStatus.ActionNeeded,
  [ReservationStatus.SecuredAndInvoiced]: TravelerStatus.ReadyToPay,
  [ReservationStatus.PendingPayment]: TravelerStatus.ReadyToPay,
  [ReservationStatus.Confirmed]: TravelerStatus.Confirmed,
  [ReservationStatus.InProgress]: TravelerStatus.OnTrip,
  [ReservationStatus.Completed]: TravelerStatus.Completed,
  [ReservationStatus.Cancelled]: TravelerStatus.Cancelled,
};

/** The label a traveler sees for a reservation in `status`. */
export function travelerStatus(status: ReservationStatus): TravelerStatus {
  return BY_RESERVATION_STATUS[status];
}

/** The path a traveler watches a booking take, in order (Account's progress). */
export const TRAVELER_JOURNEY = [
  TravelerStatus.RequestReceived,
  TravelerStatus.ConfirmingWithHosts,
  TravelerStatus.ReadyToPay,
  TravelerStatus.Confirmed,
  TravelerStatus.OnTrip,
  TravelerStatus.Completed,
] as const;

export interface JourneyPosition {
  /** Index into TRAVELER_JOURNEY of the step the booking is at. */
  index: number;
  /** The booking waits on someone to act at this step ("Action needed"). */
  blocked: boolean;
  /** The last step is reached: every step is done. */
  finished: boolean;
}

/**
 * Where a booking stands on the traveler journey. "Action needed" holds it at
 * "Confirming with hosts"; a draft counts as a request; a cancelled booking is
 * off the journey (null).
 */
export function journeyPosition(status: ReservationStatus): JourneyPosition | null {
  const label = travelerStatus(status);
  if (label === TravelerStatus.Cancelled) {
    return null;
  }
  if (label === TravelerStatus.ActionNeeded) {
    return { index: 1, blocked: true, finished: false };
  }
  const index = label === TravelerStatus.Draft ? 0 : TRAVELER_JOURNEY.indexOf(label);
  return {
    index,
    blocked: false,
    finished: label === TravelerStatus.Completed,
  };
}

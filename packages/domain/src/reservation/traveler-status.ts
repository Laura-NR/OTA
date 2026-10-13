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

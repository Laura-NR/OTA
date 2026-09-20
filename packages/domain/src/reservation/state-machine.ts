import { InvalidReservationTransitionError } from '../errors';
import { ReservationStatus } from './status';

type TransitionMap = Readonly<Record<ReservationStatus, readonly ReservationStatus[]>>;

/**
 * The only legal reservation transitions. Anything not listed is rejected by
 * `assertTransition`; callers must not mutate status directly.
 */
const TRANSITIONS: TransitionMap = {
  [ReservationStatus.Draft]: [
    ReservationStatus.ItinerarySubmitted,
    ReservationStatus.Cancelled,
  ],
  [ReservationStatus.ItinerarySubmitted]: [
    ReservationStatus.DispatchInProgress,
    ReservationStatus.ActionRequired,
    ReservationStatus.Cancelled,
  ],
  [ReservationStatus.DispatchInProgress]: [
    ReservationStatus.AssemblyAndEscalation,
    ReservationStatus.ActionRequired,
    ReservationStatus.Cancelled,
  ],
  [ReservationStatus.AssemblyAndEscalation]: [
    ReservationStatus.SecuredAndInvoiced,
    ReservationStatus.ActionRequired,
    ReservationStatus.Cancelled,
  ],
  [ReservationStatus.SecuredAndInvoiced]: [
    ReservationStatus.PendingPayment,
    ReservationStatus.Cancelled,
  ],
  [ReservationStatus.PendingPayment]: [
    ReservationStatus.Confirmed,
    ReservationStatus.Cancelled,
  ],
  // Escalation branch: the operations desk re-routes or resolves manually.
  [ReservationStatus.ActionRequired]: [
    ReservationStatus.DispatchInProgress,
    ReservationStatus.AssemblyAndEscalation,
    ReservationStatus.Cancelled,
  ],
  [ReservationStatus.Confirmed]: [
    ReservationStatus.InProgress,
    ReservationStatus.Cancelled,
  ],
  [ReservationStatus.InProgress]: [
    ReservationStatus.Completed,
    ReservationStatus.Cancelled,
  ],
  [ReservationStatus.Completed]: [],
  [ReservationStatus.Cancelled]: [],
};

export function nextStatuses(status: ReservationStatus): readonly ReservationStatus[] {
  return TRANSITIONS[status];
}

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: ReservationStatus): boolean {
  return status === ReservationStatus.Completed || status === ReservationStatus.Cancelled;
}

/**
 * Throw unless `from -> to` is a legal transition. The error carries both
 * statuses so the API layer can map it to a 409 without re-parsing a message.
 */
export function assertTransition(from: ReservationStatus, to: ReservationStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidReservationTransitionError(from, to);
  }
}

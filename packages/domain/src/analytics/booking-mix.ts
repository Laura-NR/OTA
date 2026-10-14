import { ReservationStatus } from '../reservation/status';

const CONFIRMED: readonly string[] = [
  ReservationStatus.Confirmed,
  ReservationStatus.InProgress,
  ReservationStatus.Completed,
];

const PIPELINE: readonly string[] = [
  ReservationStatus.ItinerarySubmitted,
  ReservationStatus.DispatchInProgress,
  ReservationStatus.AssemblyAndEscalation,
  ReservationStatus.SecuredAndInvoiced,
  ReservationStatus.PendingPayment,
  ReservationStatus.ActionRequired,
];

export interface BookingMix {
  /** Confirmed, on trip or completed. */
  confirmed: number;
  /** Submitted and not yet confirmed, including those that need action. */
  pipeline: number;
  cancelled: number;
}

/**
 * A-Dashboard "Bookings": a period's bookings by where they stand. A draft is
 * an operator's unsubmitted intake, not a booking yet, so it is not counted.
 */
export function bookingMix(
  funnel: readonly { status: string; count: number }[],
): BookingMix {
  const mix: BookingMix = { confirmed: 0, pipeline: 0, cancelled: 0 };
  for (const { status, count } of funnel) {
    if (CONFIRMED.includes(status)) {
      mix.confirmed += count;
    } else if (PIPELINE.includes(status)) {
      mix.pipeline += count;
    } else if (status === ReservationStatus.Cancelled) {
      mix.cancelled += count;
    }
  }
  return mix;
}

/** Change from `previous` to `current` as a fraction (0.18 is +18 %); null without a base. */
export function relativeChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return (current - previous) / previous;
}

import { describe, expect, it } from 'vitest';

import {
  InvalidReservationTransitionError,
  ReservationStatus,
  assertTransition,
  canTransition,
  isTerminal,
  nextStatuses,
} from '../src';

describe('reservation state machine', () => {
  it('allows the happy-path pipeline in order', () => {
    const pipeline = [
      ReservationStatus.Draft,
      ReservationStatus.ItinerarySubmitted,
      ReservationStatus.DispatchInProgress,
      ReservationStatus.AssemblyAndEscalation,
      ReservationStatus.SecuredAndInvoiced,
      ReservationStatus.PendingPayment,
      ReservationStatus.Confirmed,
      ReservationStatus.InProgress,
      ReservationStatus.Completed,
    ];

    for (let i = 0; i < pipeline.length - 1; i += 1) {
      expect(canTransition(pipeline[i]!, pipeline[i + 1]!)).toBe(true);
    }
  });

  it('lets the escalation branch return to dispatching', () => {
    expect(
      canTransition(
        ReservationStatus.ActionRequired,
        ReservationStatus.DispatchInProgress,
      ),
    ).toBe(true);
  });

  it('rejects skipping payment and confirming', () => {
    expect(
      canTransition(ReservationStatus.SecuredAndInvoiced, ReservationStatus.Confirmed),
    ).toBe(false);
  });

  it('treats COMPLETED and CANCELLED as terminal', () => {
    expect(isTerminal(ReservationStatus.Completed)).toBe(true);
    expect(isTerminal(ReservationStatus.Cancelled)).toBe(true);
    expect(nextStatuses(ReservationStatus.Completed)).toEqual([]);
    expect(nextStatuses(ReservationStatus.Cancelled)).toEqual([]);
  });

  it('throws a typed error carrying both statuses', () => {
    expect(() =>
      assertTransition(ReservationStatus.Completed, ReservationStatus.InProgress),
    ).toThrowError(InvalidReservationTransitionError);

    try {
      assertTransition(ReservationStatus.Draft, ReservationStatus.Confirmed);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidReservationTransitionError);
      expect((error as InvalidReservationTransitionError).from).toBe(
        ReservationStatus.Draft,
      );
      expect((error as InvalidReservationTransitionError).to).toBe(
        ReservationStatus.Confirmed,
      );
    }
  });
});

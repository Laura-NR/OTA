import { describe, expect, it } from 'vitest';

import { RESERVATION_STATUSES, ReservationStatus } from '../src/reservation/status';
import {
  journeyPosition,
  TravelerStatus,
  travelerStatus,
} from '../src/reservation/traveler-status';

describe('travelerStatus (DS 03 vocabulary)', () => {
  it('gives every reservation status a traveler label', () => {
    const labels = Object.values(TravelerStatus);
    for (const status of RESERVATION_STATUSES) {
      expect(labels).toContain(travelerStatus(status));
    }
  });

  it('hides the dispatch pipeline behind "Confirming with hosts"', () => {
    expect(travelerStatus(ReservationStatus.DispatchInProgress)).toBe(
      'confirmingWithHosts',
    );
    expect(travelerStatus(ReservationStatus.AssemblyAndEscalation)).toBe(
      'confirmingWithHosts',
    );
  });

  it('shows one "Ready to pay" from invoicing until the money arrives', () => {
    expect(travelerStatus(ReservationStatus.SecuredAndInvoiced)).toBe('readyToPay');
    expect(travelerStatus(ReservationStatus.PendingPayment)).toBe('readyToPay');
  });

  it('names the remaining states as DS 03 does', () => {
    expect(travelerStatus(ReservationStatus.ItinerarySubmitted)).toBe('requestReceived');
    expect(travelerStatus(ReservationStatus.ActionRequired)).toBe('actionNeeded');
    expect(travelerStatus(ReservationStatus.Confirmed)).toBe('confirmed');
    expect(travelerStatus(ReservationStatus.InProgress)).toBe('onTrip');
    expect(travelerStatus(ReservationStatus.Completed)).toBe('completed');
    expect(travelerStatus(ReservationStatus.Cancelled)).toBe('cancelled');
    expect(travelerStatus(ReservationStatus.Draft)).toBe('draft');
  });
});

describe('journeyPosition (Account progress)', () => {
  it('places each pipeline state on the traveler journey', () => {
    expect(journeyPosition(ReservationStatus.ItinerarySubmitted)).toEqual({
      index: 0,
      blocked: false,
      finished: false,
    });
    expect(journeyPosition(ReservationStatus.DispatchInProgress)?.index).toBe(1);
    expect(journeyPosition(ReservationStatus.PendingPayment)?.index).toBe(2);
    expect(journeyPosition(ReservationStatus.Confirmed)?.index).toBe(3);
    expect(journeyPosition(ReservationStatus.InProgress)?.index).toBe(4);
  });

  it('holds "Action needed" at the hosts step, flagged', () => {
    expect(journeyPosition(ReservationStatus.ActionRequired)).toEqual({
      index: 1,
      blocked: true,
      finished: false,
    });
  });

  it('finishes a completed trip and drops a cancelled one', () => {
    expect(journeyPosition(ReservationStatus.Completed)).toEqual({
      index: 5,
      blocked: false,
      finished: true,
    });
    expect(journeyPosition(ReservationStatus.Cancelled)).toBeNull();
    expect(journeyPosition(ReservationStatus.Draft)?.index).toBe(0);
  });
});

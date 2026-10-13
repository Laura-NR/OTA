import { describe, expect, it } from 'vitest';

import { RESERVATION_STATUSES, ReservationStatus } from '../src/reservation/status';
import { TravelerStatus, travelerStatus } from '../src/reservation/traveler-status';

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

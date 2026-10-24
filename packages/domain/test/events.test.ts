import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OPERATING_THRESHOLDS,
  canMoveEventRequest,
  derivedTrip,
  eventIsListed,
  eventRequestAnswerOverdue,
  eventRequestIssues,
  eventTakesRequests,
  festivalWindow,
  isLinkableBooking,
  ticketCharges,
  ticketCount,
  ticketInstalmentDueAt,
  travelerMayCancelEventRequest,
  type RequestableEvent,
} from '../src';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const now = new Date('2026-10-24T15:00:00Z');

const jazz: RequestableEvent & { startsOn: Date; nights: { id: string; date: Date }[] } =
  {
    status: 'PUBLISHED',
    access: 'ALLOCATIONS_OPEN',
    startsOn: day('2027-01-18'),
    endsOn: day('2027-01-24'),
    nights: [
      { id: 'n1', date: day('2027-01-18') },
      { id: 'n2', date: day('2027-01-19') },
      { id: 'n6', date: day('2027-01-23') },
    ],
    categories: [
      { id: 'gen', kind: 'GENERAL' },
      { id: 'pass', kind: 'PASS' },
    ],
  };

describe('M10 ticket count', () => {
  it('counts one ticket per seat per night, and one per seat for a pass', () => {
    expect(ticketCount('NUMBERED', 2, 3)).toBe(6);
    expect(ticketCount('PASS', 2, 0)).toBe(2);
  });
});

describe('M10 event listing (D2)', () => {
  it('lists a published event until its last Havana day has passed', () => {
    expect(eventIsListed({ status: 'PUBLISHED', endsOn: day('2026-10-24') }, now)).toBe(
      true,
    );
    expect(eventIsListed({ status: 'PUBLISHED', endsOn: day('2026-10-23') }, now)).toBe(
      false,
    );
    expect(eventIsListed({ status: 'DRAFT', endsOn: day('2027-01-24') }, now)).toBe(
      false,
    );
  });

  it('takes no seat requests for free, guide-only events', () => {
    expect(eventTakesRequests(jazz, now)).toBe(true);
    expect(eventTakesRequests({ ...jazz, access: 'GUIDE_ONLY' }, now)).toBe(false);
  });
});

describe('M10 request choice (D3)', () => {
  it('accepts nights and a category of the event, within the seat cap', () => {
    expect(
      eventRequestIssues(
        jazz,
        { categoryId: 'gen', nightIds: ['n1', 'n2'], seats: 2 },
        8,
        now,
      ),
    ).toEqual([]);
  });

  it('refuses a pass that names nights, and a night ticket without one', () => {
    expect(
      eventRequestIssues(
        jazz,
        { categoryId: 'pass', nightIds: ['n1'], seats: 2 },
        8,
        now,
      ),
    ).toEqual(['PASS_HAS_NIGHTS']);
    expect(
      eventRequestIssues(jazz, { categoryId: 'gen', nightIds: [], seats: 2 }, 8, now),
    ).toEqual(['NIGHTS_REQUIRED']);
  });

  it("refuses another event's night or category, a repeated night and too many seats", () => {
    expect(
      eventRequestIssues(
        jazz,
        { categoryId: 'other', nightIds: ['n1', 'n1', 'x'], seats: 9 },
        8,
        now,
      ),
    ).toEqual(['CATEGORY', 'NIGHT', 'DUPLICATE_NIGHT', 'SEATS']);
  });

  it('applies a lower manifest cap, never a higher one than the database', () => {
    const choice = { categoryId: 'pass', nightIds: [], seats: 6 };
    expect(eventRequestIssues(jazz, choice, 4, now)).toEqual(['SEATS']);
    expect(eventRequestIssues(jazz, { ...choice, seats: 9 }, 20, now)).toEqual(['SEATS']);
  });

  it('refuses a request once the event is over or for a guide-only event', () => {
    const choice = { categoryId: 'pass', nightIds: [], seats: 2 };
    expect(
      eventRequestIssues({ ...jazz, endsOn: day('2026-10-01') }, choice, 8, now),
    ).toEqual(['EVENT_CLOSED']);
    expect(eventRequestIssues({ ...jazz, access: 'GUIDE_ONLY' }, choice, 8, now)).toEqual(
      ['EVENT_CLOSED'],
    );
  });
});

describe('M10 request moves (D3)', () => {
  it('lets the desk answer, confirm or close an open request', () => {
    expect(canMoveEventRequest('SUBMITTED', 'REQUESTING')).toBe(true);
    expect(canMoveEventRequest('REQUESTING', 'CONFIRMED')).toBe(true);
    expect(canMoveEventRequest('SUBMITTED', 'UNAVAILABLE')).toBe(true);
  });

  it('never confirms unanswered seats, and never reopens a closed request', () => {
    expect(canMoveEventRequest('SUBMITTED', 'CONFIRMED')).toBe(false);
    expect(canMoveEventRequest('UNAVAILABLE', 'REQUESTING')).toBe(false);
    expect(canMoveEventRequest('CANCELLED', 'SUBMITTED')).toBe(false);
    expect(canMoveEventRequest('CONFIRMED', 'UNAVAILABLE')).toBe(false);
    expect(canMoveEventRequest('CONFIRMED', 'CANCELLED')).toBe(true);
  });

  it('lets the traveler withdraw only what is not yet confirmed', () => {
    expect(travelerMayCancelEventRequest('SUBMITTED')).toBe(true);
    expect(travelerMayCancelEventRequest('REQUESTING')).toBe(true);
    expect(travelerMayCancelEventRequest('CONFIRMED')).toBe(false);
  });
});

describe('M10 answer alert (D7)', () => {
  const hours = DEFAULT_OPERATING_THRESHOLDS.conciergeAnswerHours;

  it("defaults to the board's 48 hours", () => {
    expect(hours).toBe(48);
  });

  it('flags a submitted request older than the threshold only', () => {
    const old = new Date(now.getTime() - 49 * 3_600_000);
    const fresh = new Date(now.getTime() - 47 * 3_600_000);
    expect(
      eventRequestAnswerOverdue({ status: 'SUBMITTED', createdAt: old }, now, hours),
    ).toBe(true);
    expect(
      eventRequestAnswerOverdue({ status: 'SUBMITTED', createdAt: fresh }, now, hours),
    ).toBe(false);
    expect(
      eventRequestAnswerOverdue({ status: 'REQUESTING', createdAt: old }, now, hours),
    ).toBe(false);
  });
});

describe('M10 derived trip (D5)', () => {
  it('spans the chosen nights, or the whole event for a pass', () => {
    expect(festivalWindow(jazz, 'GENERAL', ['n6', 'n2'])).toEqual({
      first: day('2027-01-19'),
      last: day('2027-01-23'),
    });
    expect(festivalWindow(jazz, 'PASS', [])).toEqual({
      first: day('2027-01-18'),
      last: day('2027-01-24'),
    });
  });

  const window = { first: day('2027-01-19'), last: day('2027-01-23') };

  it('builds the festival in its province, then the chosen place for the rest', () => {
    expect(
      derivedTrip({
        path: 'BUILD',
        province: 'CU03',
        window,
        seats: 2,
        arrival: day('2027-01-17'),
        totalNights: 10,
        afterProvince: 'CU01',
      }),
    ).toEqual({
      trip: {
        startDate: day('2027-01-17'),
        endDate: day('2027-01-27'),
        adults: 2,
        route: [
          { province: 'CU03', nights: 7 },
          { province: 'CU01', nights: 3 },
        ],
      },
    });
  });

  it('stays in the province when nothing follows the festival', () => {
    const result = derivedTrip({
      path: 'BUILD',
      province: 'CU03',
      window,
      seats: 1,
      arrival: day('2027-01-17'),
      totalNights: 9,
      afterProvince: null,
    });
    expect('trip' in result && result.trip.route).toEqual([
      { province: 'CU03', nights: 9 },
    ]);
  });

  it('refuses an arrival after the first night and a trip shorter than the festival', () => {
    const base = { path: 'BUILD' as const, province: 'CU03', window, seats: 2 };
    expect(derivedTrip({ ...base, arrival: day('2027-01-20'), totalNights: 6 })).toEqual({
      issue: 'ARRIVAL_AFTER_FIRST_NIGHT',
    });
    expect(derivedTrip({ ...base, arrival: day('2027-01-17'), totalNights: 6 })).toEqual({
      issue: 'TOO_SHORT',
    });
    expect(derivedTrip({ ...base, arrival: day('2027-01-17'), totalNights: 31 })).toEqual(
      {
        issue: 'TOO_LONG',
      },
    );
    expect(derivedTrip(base)).toEqual({ issue: 'ARRIVAL_REQUIRED' });
  });

  it('makes tickets only the smallest trip: the festival nights alone', () => {
    expect(
      derivedTrip({ path: 'TICKETS_ONLY', province: 'CU03', window, seats: 3 }),
    ).toEqual({
      trip: {
        startDate: day('2027-01-19'),
        endDate: day('2027-01-24'),
        adults: 3,
        route: [{ province: 'CU03', nights: 5 }],
      },
    });
  });
});

describe('M10 linkable bookings (D5)', () => {
  it('links an open booking that is not over before the event starts', () => {
    expect(
      isLinkableBooking({ status: 'CONFIRMED', endDate: day('2027-01-20') }, jazz),
    ).toBe(true);
    expect(
      isLinkableBooking({ status: 'CONFIRMED', endDate: day('2027-01-10') }, jazz),
    ).toBe(false);
    expect(
      isLinkableBooking({ status: 'CANCELLED', endDate: day('2027-01-30') }, jazz),
    ).toBe(false);
  });
});

describe('M10 ticket charges (D6)', () => {
  it('adds the tickets and the per-ticket fee, each rounded to the cent', () => {
    expect(ticketCharges(6, 33.335, 12.5)).toEqual({
      tickets: 6,
      ticketsAmount: 200.01,
      feeAmount: 75,
      total: 275.01,
    });
  });

  it('falls due in the payment days, or on an earlier unpaid balance date', () => {
    const confirmed = new Date('2026-12-10T10:00:00Z');
    expect(ticketInstalmentDueAt(confirmed, 7, null)).toEqual(
      new Date('2026-12-17T10:00:00Z'),
    );
    const balance = new Date('2026-12-14T00:00:00Z');
    expect(ticketInstalmentDueAt(confirmed, 7, balance)).toEqual(balance);
    // A balance already past due never makes the tickets due in the past.
    expect(ticketInstalmentDueAt(confirmed, 7, new Date('2026-12-01T00:00:00Z'))).toEqual(
      new Date('2026-12-17T10:00:00Z'),
    );
  });
});

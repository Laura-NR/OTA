import { describe, expect, it } from 'vitest';

import {
  deskChoiceRefusal,
  disruptionCaseCounts,
  disruptionOfferState,
  disruptionReference,
  effectiveChoice,
  isTripArriving,
  isTripUnderWay,
  isUnknownOverdue,
  needsCall,
  sendOptionsIssue,
  suggestDisruptionBookings,
  travelerChoiceRefusal,
  type DisruptionCaseRow,
  type DisruptionOffer,
  type DisruptionTrip,
} from '../src';

const NOW = new Date('2026-10-06T14:33:00Z');
const hoursFrom = (date: Date, hours: number) =>
  new Date(date.getTime() + hours * 3600_000);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const NOT_SENT: DisruptionOffer = {
  offerSentAt: null,
  offerDeadline: null,
  defaultOptionKey: null,
  chosenOptionKey: null,
  choiceSource: null,
  chosenAt: null,
};

const AWAITING: DisruptionOffer = {
  ...NOT_SENT,
  offerSentAt: NOW,
  offerDeadline: hoursFrom(NOW, 3.5),
  defaultOptionKey: 'A',
};

const KEYS = ['A', 'B', 'C', 'D'];

describe('disruption references', () => {
  it('pads the sequence to four digits', () => {
    expect(disruptionReference(931)).toBe('DC-0931');
    expect(disruptionReference(12345)).toBe('DC-12345');
  });
});

describe('the red "Unknown" on the status board', () => {
  const attachedAt = hoursFrom(NOW, -10);

  it('turns red after 4 h without contact on a major case', () => {
    const lastContactAt = hoursFrom(NOW, -4);
    expect(
      isUnknownOverdue('MAJOR', { safety: 'UNKNOWN', lastContactAt, attachedAt }, NOW),
    ).toBe(true);
    expect(
      isUnknownOverdue(
        'MAJOR',
        { safety: 'UNKNOWN', lastContactAt: hoursFrom(NOW, -3.9), attachedAt },
        NOW,
      ),
    ).toBe(false);
  });

  it('turns red after 1 h on an emergency', () => {
    const lastContactAt = hoursFrom(NOW, -1);
    expect(
      isUnknownOverdue(
        'EMERGENCY',
        { safety: 'UNKNOWN', lastContactAt, attachedAt },
        NOW,
      ),
    ).toBe(true);
  });

  it('never turns red on a minor case, where travelers are contacted once', () => {
    expect(
      isUnknownOverdue(
        'MINOR',
        { safety: 'UNKNOWN', lastContactAt: null, attachedAt },
        NOW,
      ),
    ).toBe(false);
  });

  it('counts from the attachment when the party was never reached', () => {
    expect(
      isUnknownOverdue(
        'MAJOR',
        { safety: 'UNKNOWN', lastContactAt: null, attachedAt: hoursFrom(NOW, -5) },
        NOW,
      ),
    ).toBe(true);
    expect(
      isUnknownOverdue(
        'MAJOR',
        { safety: 'UNKNOWN', lastContactAt: null, attachedAt: hoursFrom(NOW, -1) },
        NOW,
      ),
    ).toBe(false);
  });

  it('only flags Unknown, never Safe or Needs help', () => {
    const lastContactAt = hoursFrom(NOW, -48);
    expect(
      isUnknownOverdue('EMERGENCY', { safety: 'SAFE', lastContactAt, attachedAt }, NOW),
    ).toBe(false);
    expect(
      isUnknownOverdue(
        'EMERGENCY',
        { safety: 'NEEDS_HELP', lastContactAt, attachedAt },
        NOW,
      ),
    ).toBe(false);
  });
});

describe('the effective choice after the deadline', () => {
  it('has none before the options are sent', () => {
    expect(disruptionOfferState(NOT_SENT, NOW)).toBe('NOT_SENT');
    expect(effectiveChoice(NOT_SENT, NOW)).toBeNull();
  });

  it('has none while the traveler can still answer', () => {
    expect(disruptionOfferState(AWAITING, NOW)).toBe('AWAITING');
    expect(effectiveChoice(AWAITING, NOW)).toBeNull();
    expect(needsCall(AWAITING, NOW)).toBe(false);
  });

  it('keeps the default once the deadline passes, derived on read, and puts the booking on the call list', () => {
    const later = hoursFrom(NOW, 3.5);
    expect(disruptionOfferState(AWAITING, later)).toBe('DEFAULTED');
    expect(effectiveChoice(AWAITING, later)).toEqual({
      key: 'A',
      source: 'DEFAULT',
      derived: true,
    });
    expect(needsCall(AWAITING, later)).toBe(true);
  });

  it('uses the recorded answer whatever the clock says', () => {
    const chosen: DisruptionOffer = {
      ...AWAITING,
      chosenOptionKey: 'B',
      choiceSource: 'TRAVELER',
      chosenAt: hoursFrom(NOW, 1),
    };
    const later = hoursFrom(NOW, 10);
    expect(disruptionOfferState(chosen, later)).toBe('CHOSEN');
    expect(effectiveChoice(chosen, later)).toEqual({
      key: 'B',
      source: 'TRAVELER',
      derived: false,
    });
    expect(needsCall(chosen, later)).toBe(false);
  });

  it('takes a default the desk confirmed off the call list', () => {
    const confirmed: DisruptionOffer = {
      ...AWAITING,
      chosenOptionKey: 'A',
      choiceSource: 'DEFAULT',
    };
    expect(needsCall(confirmed, hoursFrom(NOW, 5))).toBe(false);
    expect(effectiveChoice(confirmed, hoursFrom(NOW, 5))).toEqual({
      key: 'A',
      source: 'DEFAULT',
      derived: false,
    });
  });
});

describe('who may choose', () => {
  it('lets the traveler answer once, before the deadline, on an open case', () => {
    expect(travelerChoiceRefusal('OPEN', AWAITING, KEYS, 'B', NOW)).toBeNull();
    expect(travelerChoiceRefusal('CLOSED', AWAITING, KEYS, 'B', NOW)).toBe('CASE_CLOSED');
    expect(travelerChoiceRefusal('OPEN', NOT_SENT, KEYS, 'B', NOW)).toBe('NOT_OFFERED');
    expect(travelerChoiceRefusal('OPEN', AWAITING, KEYS, 'B', hoursFrom(NOW, 4))).toBe(
      'DEADLINE_PASSED',
    );
    expect(
      travelerChoiceRefusal(
        'OPEN',
        { ...AWAITING, chosenOptionKey: 'A', choiceSource: 'TRAVELER' },
        KEYS,
        'B',
        NOW,
      ),
    ).toBe('ALREADY_CHOSEN');
    expect(travelerChoiceRefusal('OPEN', AWAITING, ['A', 'B'], 'D', NOW)).toBe(
      'UNKNOWN_OPTION',
    );
  });

  it('lets the desk record a phone answer at any time on an open case, even over a recorded one', () => {
    const chosen = {
      ...AWAITING,
      chosenOptionKey: 'A',
      choiceSource: 'TRAVELER' as const,
    };
    expect(
      deskChoiceRefusal('OPEN', chosen, KEYS, 'C', 'DESK', hoursFrom(NOW, 8)),
    ).toBeNull();
    expect(deskChoiceRefusal('CLOSED', chosen, KEYS, 'C', 'DESK', NOW)).toBe(
      'CASE_CLOSED',
    );
    expect(deskChoiceRefusal('OPEN', NOT_SENT, KEYS, 'C', 'DESK', NOW)).toBe(
      'NOT_OFFERED',
    );
  });

  it('confirms only the default, and only after the deadline', () => {
    expect(deskChoiceRefusal('OPEN', AWAITING, KEYS, 'A', 'DEFAULT', NOW)).toBe(
      'DEADLINE_NOT_PASSED',
    );
    expect(
      deskChoiceRefusal('OPEN', AWAITING, KEYS, 'B', 'DEFAULT', hoursFrom(NOW, 4)),
    ).toBe('NOT_DEFAULT');
    expect(
      deskChoiceRefusal('OPEN', AWAITING, KEYS, 'A', 'DEFAULT', hoursFrom(NOW, 4)),
    ).toBeNull();
  });
});

describe('sending options', () => {
  it('needs an open case, options, a default among them and a deadline ahead', () => {
    const deadline = hoursFrom(NOW, 4);
    expect(sendOptionsIssue('OPEN', KEYS, 'A', deadline, NOW)).toBeNull();
    expect(sendOptionsIssue('CLOSED', KEYS, 'A', deadline, NOW)).toBe('CASE_CLOSED');
    expect(sendOptionsIssue('OPEN', [], 'A', deadline, NOW)).toBe('NO_OPTIONS');
    expect(sendOptionsIssue('OPEN', ['A', 'B'], 'C', deadline, NOW)).toBe(
      'UNKNOWN_DEFAULT',
    );
    expect(sendOptionsIssue('OPEN', KEYS, 'A', NOW, NOW)).toBe('DEADLINE_PAST');
  });
});

const trip = (overrides: Partial<DisruptionTrip>): DisruptionTrip => ({
  reservationId: 'r',
  status: 'CONFIRMED',
  startDate: day('2026-10-04'),
  endDate: day('2026-10-10'),
  provinces: ['CU01'],
  ...overrides,
});

describe('trip timing', () => {
  it('is under way from the first day to the midnight after the last', () => {
    expect(isTripUnderWay(trip({}), NOW)).toBe(true);
    expect(isTripUnderWay(trip({ endDate: day('2026-10-06') }), NOW)).toBe(true);
    expect(isTripUnderWay(trip({ endDate: day('2026-10-05') }), NOW)).toBe(false);
    expect(isTripUnderWay(trip({ startDate: day('2026-10-07') }), NOW)).toBe(false);
  });

  it('is arriving when it starts within 72 h', () => {
    expect(isTripArriving(trip({ startDate: day('2026-10-08') }), NOW)).toBe(true);
    expect(isTripArriving(trip({ startDate: day('2026-10-10') }), NOW)).toBe(false);
    expect(isTripArriving(trip({}), NOW)).toBe(false);
  });
});

describe('suggested bookings', () => {
  const trips = [
    trip({
      reservationId: 'arriving',
      startDate: day('2026-10-08'),
      endDate: day('2026-10-12'),
    }),
    trip({ reservationId: 'holm' }),
    trip({
      reservationId: 'later',
      startDate: day('2026-10-20'),
      endDate: day('2026-10-25'),
    }),
    trip({ reservationId: 'elsewhere', provinces: ['CU07'] }),
    trip({ reservationId: 'unpaid', status: 'ITINERARY_SUBMITTED' }),
    trip({ reservationId: 'done', endDate: day('2026-10-05') }),
    trip({ reservationId: 'attached' }),
  ];

  it('suggests secured trips in the province under way or starting within 72 h, earliest first', () => {
    expect(
      suggestDisruptionBookings('CU01', trips, ['attached'], NOW).map(
        (t) => t.reservationId,
      ),
    ).toEqual(['holm', 'arriving']);
  });

  it('suggests nothing for a case without a province', () => {
    expect(suggestDisruptionBookings(null, trips, [], NOW)).toEqual([]);
  });
});

describe('case counts', () => {
  const attachedAt = hoursFrom(NOW, -8);
  const row = (overrides: Partial<DisruptionCaseRow>): DisruptionCaseRow => ({
    ...AWAITING,
    safety: 'UNKNOWN',
    lastContactAt: null,
    attachedAt,
    startDate: day('2026-10-04'),
    endDate: day('2026-10-10'),
    ...overrides,
  });

  it('counts the party on the ground, arriving, by safety, red unknowns and calls due', () => {
    const rows = [
      row({ safety: 'SAFE', lastContactAt: hoursFrom(NOW, -5) }),
      row({}),
      row({
        startDate: day('2026-10-08'),
        endDate: day('2026-10-12'),
        offerDeadline: hoursFrom(NOW, -1),
      }),
      row({ safety: 'NEEDS_HELP', ...NOT_SENT }),
    ];
    expect(disruptionCaseCounts('MAJOR', rows, NOW)).toEqual({
      affected: 4,
      onTheGround: 3,
      arriving: 1,
      safe: 1,
      needsHelp: 1,
      unknown: 2,
      overdueUnknown: 2,
      callNow: 1,
    });
    expect(disruptionCaseCounts('MINOR', rows, NOW).overdueUnknown).toBe(0);
  });
});

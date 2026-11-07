import { describe, expect, it } from 'vitest';

import {
  customRequestChanges,
  customRequestEditable,
  eventLinkRefusals,
  type LinkedEventSeats,
  type RequestAnswers,
} from '../src';

const answers: RequestAnswers = {
  startDate: '2027-03-01T00:00:00.000Z',
  endDate: '2027-03-08T00:00:00.000Z',
  adults: 2,
  children: 0,
  inventoryItemIds: ['a', 'b'],
  nationality: 'GB',
  budgetPerPerson: null,
  interests: ['music', 'food'],
  pace: 'moderate',
  route: [
    { province: 'CU03', nights: 3, stay: 'comfort' },
    { province: 'CU07', nights: 4, stay: 'heritage' },
  ],
  transport: 'minivan',
  guiding: 'none',
  interpreter: false,
  stepFree: false,
  notes: 'Birding first.',
  locale: 'en',
};

describe('when a custom request can be edited', () => {
  it('is editable while it is open and no proposal has been sent', () => {
    expect(
      customRequestEditable({ requestStatus: 'OPEN', proposalStatus: 'DRAFT' }),
    ).toBe(true);
  });

  it('stops being editable once the desk sends a proposal', () => {
    for (const proposalStatus of ['SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED']) {
      expect(customRequestEditable({ requestStatus: 'OPEN', proposalStatus })).toBe(
        false,
      );
    }
  });

  it('is never editable once the request is converted or closed', () => {
    expect(
      customRequestEditable({ requestStatus: 'CONVERTED', proposalStatus: 'DRAFT' }),
    ).toBe(false);
    expect(
      customRequestEditable({ requestStatus: 'CLOSED', proposalStatus: 'DRAFT' }),
    ).toBe(false);
  });
});

describe('what an edit changed', () => {
  it('reports nothing for the same answers, whatever the order of sets', () => {
    expect(
      customRequestChanges(answers, {
        ...answers,
        inventoryItemIds: ['b', 'a'],
        interests: ['food', 'music'],
        startDate: '2027-03-01T00:00:00Z',
      }),
    ).toEqual([]);
  });

  it('names each changed part in the desk order', () => {
    expect(
      customRequestChanges(answers, {
        ...answers,
        endDate: '2027-03-10T00:00:00.000Z',
        children: 1,
        route: [
          { province: 'CU03', nights: 3, stay: 'comfort' },
          { province: 'CU07', nights: 6, stay: 'heritage' },
        ],
        notes: null,
        locale: 'fr',
      }),
    ).toEqual(['dates', 'party', 'route', 'notes', 'language']);
  });

  it('counts a stay change only on a stop both routes share', () => {
    expect(
      customRequestChanges(answers, {
        ...answers,
        route: [
          { province: 'CU03', nights: 3, stay: 'boutique' },
          { province: 'CU07', nights: 4, stay: 'heritage' },
        ],
      }),
    ).toEqual(['stays']);
    // A new stop is a route change, not a stay change.
    expect(
      customRequestChanges(answers, {
        ...answers,
        route: [
          { province: 'CU03', nights: 3, stay: 'comfort' },
          { province: 'CU09', nights: 4, stay: 'heritage' },
        ],
      }),
    ).toEqual(['route']);
  });

  it('treats a reordered route as a route change', () => {
    expect(
      customRequestChanges(answers, { ...answers, route: [...answers.route].reverse() }),
    ).toEqual(['route']);
  });

  it('counts the interpreter with guiding and step-free with access', () => {
    expect(
      customRequestChanges(answers, { ...answers, interpreter: true, stepFree: true }),
    ).toEqual(['guiding', 'access']);
  });

  it('treats empty notes and no notes as the same', () => {
    expect(
      customRequestChanges({ ...answers, notes: null }, { ...answers, notes: '' }),
    ).toEqual([]);
  });
});

describe('an edited trip keeps its event seats', () => {
  const festival: LinkedEventSeats = {
    reference: 'VX-E-AAAA1111',
    eventName: 'Jazz Plaza',
    province: 'CU03',
    window: {
      first: new Date('2027-03-02T00:00:00Z'),
      last: new Date('2027-03-04T00:00:00Z'),
    },
    seats: 2,
  };
  const trip = {
    startDate: new Date('2027-03-01T00:00:00Z'),
    endDate: new Date('2027-03-05T00:00:00Z'),
    partySize: 2,
    provinces: ['CU03', 'CU07'],
  };

  it('accepts a trip from the first night to the morning after the last', () => {
    expect(eventLinkRefusals(trip, [festival])).toEqual([]);
    expect(
      eventLinkRefusals({ ...trip, startDate: new Date('2027-03-02T00:00:00Z') }, [
        festival,
      ]),
    ).toEqual([]);
  });

  it('refuses a trip that arrives after the first night or leaves before the morning after', () => {
    expect(
      eventLinkRefusals({ ...trip, startDate: new Date('2027-03-03T00:00:00Z') }, [
        festival,
      ]),
    ).toEqual([
      { kind: 'EVENT_DATES', reference: festival.reference, eventName: 'Jazz Plaza' },
    ]);
    expect(
      eventLinkRefusals({ ...trip, endDate: new Date('2027-03-04T00:00:00Z') }, [
        festival,
      ]),
    ).toEqual([
      { kind: 'EVENT_DATES', reference: festival.reference, eventName: 'Jazz Plaza' },
    ]);
  });

  it('refuses a party smaller than the seats', () => {
    expect(
      eventLinkRefusals({ ...trip, partySize: 1 }, [festival]).map((r) => r.kind),
    ).toEqual(['EVENT_PARTY']);
  });

  it("refuses a route that no longer stops in the event's province", () => {
    expect(
      eventLinkRefusals({ ...trip, provinces: ['CU07'] }, [festival]).map((r) => r.kind),
    ).toEqual(['EVENT_PLACE']);
    // An empty route names no place, so only dates and party are checked.
    expect(eventLinkRefusals({ ...trip, provinces: [] }, [festival])).toEqual([]);
  });

  it('lists every refusal for every linked event request', () => {
    const second = { ...festival, reference: 'VX-E-BBBB2222', seats: 3 };
    expect(
      eventLinkRefusals({ ...trip, partySize: 2, provinces: ['CU07'] }, [
        festival,
        second,
      ]),
    ).toEqual([
      { kind: 'EVENT_PLACE', reference: 'VX-E-AAAA1111', eventName: 'Jazz Plaza' },
      { kind: 'EVENT_PARTY', reference: 'VX-E-BBBB2222', eventName: 'Jazz Plaza' },
      { kind: 'EVENT_PLACE', reference: 'VX-E-BBBB2222', eventName: 'Jazz Plaza' },
    ]);
  });
});

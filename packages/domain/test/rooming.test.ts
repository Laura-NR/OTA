import { describe, expect, it } from 'vitest';

import { planRooms, travelerKindOn } from '../src';

describe('planRooms', () => {
  it('puts a sharing couple in one double, with no single room', () => {
    expect(planRooms(['ADULT', 'ADULT'], 'SHARE')).toEqual({
      rooms: [{ capacity: 2 }],
      roomOf: [0, 0],
      singleRooms: 0,
    });
  });

  it('makes the last shared room a triple rather than leave one traveler alone', () => {
    const plan = planRooms(['ADULT', 'ADULT', 'ADULT', 'CHILD', 'CHILD'], 'SHARE');

    expect(plan.rooms).toEqual([{ capacity: 2 }, { capacity: 3 }]);
    expect(plan.roomOf).toEqual([0, 0, 1, 1, 1]);
    expect(plan.singleRooms).toBe(0);
  });

  it('gives a traveler alone a room of one even when they asked to share', () => {
    expect(planRooms(['ADULT'], 'SHARE')).toEqual({
      rooms: [{ capacity: 1 }],
      roomOf: [0],
      singleRooms: 1,
    });
  });

  it('charges a private room for every traveler who takes a bed', () => {
    const plan = planRooms(['ADULT', 'CHILD', 'ADULT'], 'PRIVATE');

    expect(plan.rooms).toEqual([{ capacity: 1 }, { capacity: 1 }, { capacity: 1 }]);
    expect(plan.roomOf).toEqual([0, 1, 2]);
    expect(plan.singleRooms).toBe(3);
  });

  it('puts infants in the first adult room without taking a bed', () => {
    const shared = planRooms(['INFANT', 'ADULT', 'ADULT', 'ADULT'], 'SHARE');
    expect(shared.rooms).toEqual([{ capacity: 3 }]);
    expect(shared.roomOf).toEqual([0, 0, 0, 0]);

    const privateRooms = planRooms(['CHILD', 'ADULT', 'INFANT'], 'PRIVATE');
    expect(privateRooms.roomOf).toEqual([0, 1, 1]);
    expect(privateRooms.singleRooms).toBe(2);
  });
});

describe('travelerKindOn', () => {
  const departure = new Date('2027-02-13T00:00:00Z');

  it('reads the kind from the age on the travel date, not the booking date', () => {
    expect(travelerKindOn(new Date('2025-02-14T00:00:00Z'), departure)).toBe('INFANT');
    expect(travelerKindOn(new Date('2025-02-13T00:00:00Z'), departure)).toBe('CHILD');
    expect(travelerKindOn(new Date('2009-02-14T00:00:00Z'), departure)).toBe('CHILD');
    expect(travelerKindOn(new Date('2009-02-13T00:00:00Z'), departure)).toBe('ADULT');
  });
});

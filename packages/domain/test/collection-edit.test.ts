import { describe, expect, it } from 'vitest';

import {
  collectionEditRefusals,
  departureCapacityRefusals,
  planCollectionEdit,
  type RowBooking,
} from '../src/packages/collection-edit';

type Stored = { id: string; code: string };
type Submitted = { code: string; capacity: number };

const stored: Stored[] = [
  { id: 'row-a', code: 'a' },
  { id: 'row-b', code: 'b' },
];
const plan = (submitted: Submitted[]) =>
  planCollectionEdit(
    stored,
    submitted,
    (row) => row.code,
    (row) => row.code,
  );
const booking = (rowId: string, bookingCode: string, partySize = 2): RowBooking => ({
  rowId,
  bookingCode,
  partySize,
});
const name = (row: Stored) => row.code;

describe('planCollectionEdit', () => {
  it('keeps a stored row whose key is submitted again, so bookings stay on it', () => {
    const edit = plan([{ code: 'a', capacity: 9 }]);

    expect(edit.update).toEqual([
      { stored: stored[0], submitted: { code: 'a', capacity: 9 } },
    ]);
    expect(edit.create).toEqual([]);
  });

  it('creates what is new and removes what was left out', () => {
    const edit = plan([
      { code: 'a', capacity: 1 },
      { code: 'c', capacity: 1 },
    ]);

    expect(edit.create).toEqual([{ code: 'c', capacity: 1 }]);
    expect(edit.remove).toEqual([stored[1]]);
  });

  it('treats a changed key as a removal and a new row, never a move', () => {
    const edit = planCollectionEdit(
      [stored[0]!],
      [{ code: 'renamed', capacity: 1 }],
      (row) => row.code,
      (row) => row.code,
    );

    expect(edit.update).toEqual([]);
    expect(edit.remove).toEqual([stored[0]]);
    expect(edit.create).toEqual([{ code: 'renamed', capacity: 1 }]);
  });

  it('reports a key submitted twice once, and applies only the first', () => {
    const edit = plan([
      { code: 'c', capacity: 1 },
      { code: 'c', capacity: 2 },
      { code: 'c', capacity: 3 },
    ]);

    expect(edit.duplicates).toEqual(['c']);
    expect(edit.create).toEqual([{ code: 'c', capacity: 1 }]);
  });
});

describe('collectionEditRefusals', () => {
  it('refuses removing a row a booking uses and names the bookings', () => {
    const edit = plan([{ code: 'a', capacity: 1 }]);

    expect(
      collectionEditRefusals('TIER_BOOKED', edit, name, [
        booking('row-b', 'ZZ000002'),
        booking('row-b', 'AA000001'),
        booking('row-b', 'AA000001'),
      ]),
    ).toEqual([
      { kind: 'TIER_BOOKED', row: 'b', bookingCodes: ['AA000001', 'ZZ000002'] },
    ]);
  });

  it('allows removing a row with no bookings, whatever the others hold', () => {
    const edit = plan([{ code: 'a', capacity: 1 }]);

    expect(
      collectionEditRefusals('EXTRA_BOOKED', edit, name, [booking('row-a', 'AA000001')]),
    ).toEqual([]);
  });

  it('refuses a row submitted twice', () => {
    const edit = plan([
      { code: 'a', capacity: 1 },
      { code: 'a', capacity: 2 },
      { code: 'b', capacity: 1 },
    ]);

    expect(collectionEditRefusals('DEPARTURE_BOOKED', edit, name, [])).toEqual([
      { kind: 'ROW_DUPLICATED', row: 'a' },
    ]);
  });
});

describe('departureCapacityRefusals', () => {
  const bookings = [booking('row-a', 'AA000001', 3), booking('row-a', 'BB000002', 2)];

  it('refuses a capacity below the seats booked, counting every traveler', () => {
    const edit = plan([{ code: 'a', capacity: 4 }]);

    expect(departureCapacityRefusals(edit, name, bookings)).toEqual([
      {
        kind: 'DEPARTURE_BELOW_BOOKED',
        row: 'a',
        capacity: 4,
        booked: 5,
        bookingCodes: ['AA000001', 'BB000002'],
      },
    ]);
  });

  it('allows a capacity equal to the seats booked', () => {
    const edit = plan([{ code: 'a', capacity: 5 }]);

    expect(departureCapacityRefusals(edit, name, bookings)).toEqual([]);
  });
});

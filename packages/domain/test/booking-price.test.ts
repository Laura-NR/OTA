import { describe, expect, it } from 'vitest';

import {
  ReservationStatus,
  ageOn,
  calculatePackagePrice,
  departurePlacesLeft,
  isPriceLocked,
  priceBooking,
  type BookingPriceInput,
} from '../src';

const bands = [
  { maxAge: 1, rate: 0 },
  { maxAge: 12, rate: 0.6 },
];

const comfort = { name: 'Comfort', priceDelta: 120, singleSupplement: 380 };

function input(overrides: Partial<BookingPriceInput> = {}): BookingPriceInput {
  return {
    packageName: 'Trinidad Heritage Trail',
    basePrice: 1000,
    departurePrice: null,
    tier: null,
    travelers: [
      { kind: 'ADULT', age: null },
      { kind: 'ADULT', age: null },
    ],
    childBands: bands,
    singleRooms: 0,
    extras: [],
    fees: [],
    ...overrides,
  };
}

describe('priceBooking', () => {
  it('freezes two adults at the base price as one base line', () => {
    const price = priceBooking(input());

    expect(price.lines).toEqual([
      {
        kind: 'BASE',
        label: 'Trinidad Heritage Trail',
        quantity: 2,
        unitAmount: 1000,
        amount: 2000,
        travelerIndex: null,
      },
    ]);
    expect(price.partySize).toBe(2);
    expect(price.total).toBe(2000);
  });

  it('bases on the departure price and adds the tier delta as its own line', () => {
    const price = priceBooking(input({ departurePrice: 1275, tier: comfort }));

    expect(
      price.lines.map((entry) => [entry.kind, entry.unitAmount, entry.amount]),
    ).toEqual([
      ['BASE', 1275, 2550],
      ['TIER', 120, 240],
    ]);
    expect(price.total).toBe(2790);
  });

  it('omits a zero tier delta', () => {
    const price = priceBooking(
      input({ tier: { name: 'Standard', priceDelta: 0, singleSupplement: null } }),
    );

    expect(price.lines.map((entry) => entry.kind)).toEqual(['BASE']);
  });

  it('prices each child at the band rate of the tiered price, linked to the traveler', () => {
    const price = priceBooking(
      input({
        tier: comfort,
        travelers: [
          { kind: 'ADULT', age: null },
          { kind: 'CHILD', age: 9 },
          { kind: 'INFANT', age: 1 },
        ],
      }),
    );

    const children = price.lines.filter((entry) => entry.kind === 'CHILD');
    // Child 9 pays 60 % of 1 120; the infant is free but still listed.
    expect(children).toEqual([
      expect.objectContaining({ amount: 672, travelerIndex: 1 }),
      expect.objectContaining({ amount: 0, travelerIndex: 2 }),
    ]);
    expect(price.total).toBe(1000 + 120 + 672);
  });

  it('charges a child without a known age, or above every band, the adult rate', () => {
    const price = priceBooking(
      input({
        travelers: [
          { kind: 'CHILD', age: null },
          { kind: 'CHILD', age: 15 },
        ],
      }),
    );

    expect(price.lines.map((entry) => [entry.kind, entry.amount])).toEqual([
      ['CHILD', 1000],
      ['CHILD', 1000],
    ]);
  });

  it('adds the tier single supplement per single room', () => {
    const price = priceBooking(input({ tier: comfort, singleRooms: 2 }));

    expect(price.lines.at(-1)).toEqual(
      expect.objectContaining({ kind: 'SINGLE_SUPPLEMENT', quantity: 2, amount: 760 }),
    );
  });

  it('ignores single rooms when the tier has no supplement', () => {
    const price = priceBooking(input({ singleRooms: 1 }));

    expect(price.lines.some((entry) => entry.kind === 'SINGLE_SUPPLEMENT')).toBe(false);
  });

  it('multiplies per-person extras and fees by the party, per-booking ones once', () => {
    const price = priceBooking(
      input({
        extras: [
          {
            label: 'Horseback half day',
            unit: 'PER_PERSON',
            unitAmount: 60,
            quantity: 1,
          },
          { label: 'Private transfer', unit: 'PER_BOOKING', unitAmount: 90, quantity: 2 },
        ],
        fees: [
          { label: 'Cuban tourist card', unit: 'PER_PERSON', amount: 25 },
          { label: 'Service fee', unit: 'PER_BOOKING', amount: 100 },
        ],
      }),
    );

    expect(
      price.lines.slice(1).map((entry) => [entry.kind, entry.quantity, entry.amount]),
    ).toEqual([
      ['EXTRA', 2, 120],
      ['EXTRA', 2, 180],
      ['FEE', 2, 50],
      ['FEE', 1, 100],
    ]);
    expect(price.total).toBe(2000 + 120 + 180 + 50 + 100);
  });

  it('agrees with the M1 package price when there are no fees', () => {
    const shared = {
      basePrice: 980,
      departurePrice: 1050,
      childBands: bands,
      singleRooms: 1,
    };
    const booking = priceBooking(
      input({
        ...shared,
        tier: { name: 'Comfort', priceDelta: 75, singleSupplement: 380 },
        travelers: [
          { kind: 'ADULT', age: null },
          { kind: 'CHILD', age: 7 },
        ],
        extras: [
          { label: 'Salsa class', unit: 'PER_PERSON', unitAmount: 35, quantity: 1 },
        ],
      }),
    );
    const m1 = calculatePackagePrice({
      ...shared,
      singleSupplement: 380,
      tierDelta: 75,
      adults: 1,
      childAges: [7],
      extras: [{ price: 35, unit: 'PER_PERSON' }],
    });

    expect(booking.total).toBe(m1.total);
  });

  it('rounds each line so the lines add up to the total', () => {
    const price = priceBooking(
      input({
        basePrice: 333.33,
        travelers: [
          { kind: 'CHILD', age: 5 },
          { kind: 'CHILD', age: 6 },
          { kind: 'CHILD', age: 7 },
        ],
      }),
    );

    const sum = price.lines.reduce((total, entry) => total + entry.amount, 0);
    expect(price.lines.every((entry) => entry.amount === 200)).toBe(true);
    expect(price.total).toBeCloseTo(sum, 10);
    expect(price.total).toBe(600);
  });
});

describe('ageOn', () => {
  it('counts whole years and turns over on the birthday', () => {
    const dob = new Date('2015-02-13');

    expect(ageOn(dob, new Date('2027-02-12'))).toBe(11);
    expect(ageOn(dob, new Date('2027-02-13'))).toBe(12);
  });
});

describe('isPriceLocked', () => {
  it('locks the price once a payment link exists, and stays open before it', () => {
    expect(isPriceLocked(ReservationStatus.SecuredAndInvoiced)).toBe(false);
    expect(isPriceLocked(ReservationStatus.ActionRequired)).toBe(false);
    expect(isPriceLocked(ReservationStatus.PendingPayment)).toBe(true);
    expect(isPriceLocked(ReservationStatus.Confirmed)).toBe(true);
    expect(isPriceLocked(ReservationStatus.Cancelled)).toBe(true);
  });
});

describe('departurePlacesLeft', () => {
  it('never goes below zero', () => {
    expect(departurePlacesLeft(12, 5)).toBe(7);
    expect(departurePlacesLeft(4, 6)).toBe(0);
  });
});

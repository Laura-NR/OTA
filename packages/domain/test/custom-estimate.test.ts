import { describe, expect, it } from 'vitest';

import { customTripEstimate, type EstimateRates } from '../src';

const rates: EstimateRates = {
  transportPerPersonDay: 28,
  sharedGuidePerPersonDay: 25,
  privateGuidePerGroupDay: 55,
  interpreterPerGroupDay: 40,
  offsetPerNight: 5,
  feePercent: 12,
  spreadPercent: 6,
};

describe('customTripEstimate (Custom board side panel)', () => {
  it('adds stays, transport, activities, a shared guide, the offset and the fee per person', () => {
    // Havana 3 + Viñales 4 + Trinidad 3 nights, two adults, four activities.
    const estimate = customTripEstimate({
      stops: [
        { nights: 3, stayPerNight: 45 },
        { nights: 4, stayPerNight: 45 },
        { nights: 3, stayPerNight: 45 },
      ],
      activities: [22, 35, 25, 34],
      guiding: 'shared',
      interpreter: false,
      partySize: 2,
      rates,
    });
    expect(estimate).toEqual({
      nights: 10,
      days: 11,
      stays: 450,
      transport: 308,
      activities: 116,
      guides: 100,
      offset: 50,
      fee: 122.88,
      total: 1146.88,
      low: 1078,
      high: 1216,
    });
  });

  it('splits a private guide and the interpreter over the party', () => {
    const estimate = customTripEstimate({
      stops: [{ nights: 4, stayPerNight: 30 }],
      activities: [20],
      guiding: 'private',
      interpreter: true,
      partySize: 2,
      rates,
    });
    // Private guide 55 × 5 days / 2 = 137.5; interpreter 40 × (5 − 1) / 2 = 80.
    expect(estimate.guides).toBe(217.5);
  });

  it('is empty before any stop is placed', () => {
    const estimate = customTripEstimate({
      stops: [],
      activities: [],
      guiding: 'none',
      interpreter: false,
      partySize: 1,
      rates,
    });
    expect(estimate).toMatchObject({ nights: 0, days: 0, total: 0, low: 0, high: 0 });
  });
});

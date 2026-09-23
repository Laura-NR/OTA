import { describe, expect, it } from 'vitest';

import {
  TOURISM_CATEGORIES,
  calculateRegulatory,
  type RegulatoryReservation,
} from '../src';

function reservation(
  overrides: Partial<RegulatoryReservation> = {},
): RegulatoryReservation {
  return {
    userId: overrides.userId ?? 'user-1',
    tourismCategory: overrides.tourismCategory ?? 'GENERAL',
    nationality: overrides.nationality ?? null,
    serviceItems: overrides.serviceItems ?? [],
  };
}

describe('calculateRegulatory', () => {
  it('breaks bookings down by category and computes the specialised ratio', () => {
    const summary = calculateRegulatory([
      reservation({ tourismCategory: 'ECOTOURISM' }),
      reservation({ tourismCategory: 'NATURE' }),
      reservation({ tourismCategory: 'CULTURAL' }),
      reservation({ tourismCategory: 'GENERAL' }),
    ]);

    expect(summary.bookings).toBe(4);
    expect(summary.specialisedRatio).toBe(0.5);
    expect(summary.byCategory).toHaveLength(TOURISM_CATEGORIES.length);
    expect(summary.byCategory.find((row) => row.category === 'ECOTOURISM')).toEqual({
      category: 'ECOTOURISM',
      count: 1,
      ratio: 0.25,
    });
  });

  it('counts distinct travelers, accommodation bed-nights, nationalities, circuits', () => {
    const summary = calculateRegulatory([
      reservation({
        userId: 'trav-a',
        nationality: 'ES',
        serviceItems: [
          {
            serviceType: 'ACCOMMODATION',
            province: 'La Habana',
            serviceDateStart: new Date('2026-10-01T00:00:00Z'),
            serviceDateEnd: new Date('2026-10-04T00:00:00Z'),
          },
          {
            serviceType: 'GUIDE',
            province: 'La Habana',
            serviceDateStart: new Date('2026-10-01T00:00:00Z'),
            serviceDateEnd: new Date('2026-10-01T00:00:00Z'),
          },
        ],
      }),
      reservation({
        userId: 'trav-a',
        nationality: 'ES',
        serviceItems: [
          {
            serviceType: 'ACCOMMODATION',
            province: 'Vinales',
            serviceDateStart: new Date('2026-11-01T00:00:00Z'),
            serviceDateEnd: new Date('2026-11-03T00:00:00Z'),
          },
        ],
      }),
      reservation({ userId: 'trav-b', nationality: 'FR' }),
    ]);

    expect(summary.travelers).toBe(2);
    expect(summary.bedNights).toBe(5);
    expect(summary.nationalities).toEqual([
      { nationality: 'ES', count: 2 },
      { nationality: 'FR', count: 1 },
    ]);
    expect(summary.circuits).toEqual([
      { province: 'La Habana', count: 2 },
      { province: 'Vinales', count: 1 },
    ]);
  });

  it('guards against division by zero and groups missing nationality', () => {
    const summary = calculateRegulatory([]);

    expect(summary.bookings).toBe(0);
    expect(summary.travelers).toBe(0);
    expect(summary.specialisedRatio).toBe(0);
    expect(summary.byCategory.every((row) => row.ratio === 0)).toBe(true);

    const unspecified = calculateRegulatory([reservation({ nationality: null })]);
    expect(unspecified.nationalities).toEqual([{ nationality: 'Unspecified', count: 1 }]);
  });

  it('never returns negative bed-nights for inverted or same-day ranges', () => {
    const summary = calculateRegulatory([
      reservation({
        serviceItems: [
          {
            serviceType: 'ACCOMMODATION',
            province: null,
            serviceDateStart: new Date('2026-10-05T00:00:00Z'),
            serviceDateEnd: new Date('2026-10-05T00:00:00Z'),
          },
          {
            serviceType: 'ACCOMMODATION',
            province: null,
            serviceDateStart: new Date('2026-10-10T00:00:00Z'),
            serviceDateEnd: new Date('2026-10-05T00:00:00Z'),
          },
        ],
      }),
    ]);

    expect(summary.bedNights).toBe(0);
  });
});

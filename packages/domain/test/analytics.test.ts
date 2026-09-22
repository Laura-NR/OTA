import { describe, expect, it } from 'vitest';

import {
  RESERVATION_STATUSES,
  calculateFinance,
  calculateGeography,
  calculateOperations,
  calculateQuality,
} from '../src';

describe('calculateFinance', () => {
  it('computes GBV, margin, take rate, AOV, and the rail breakdown', () => {
    const kpis = calculateFinance({
      paid: [
        { amount: 100, rail: 'CARD' },
        { amount: 50, rail: 'OPEN_BANKING_SEPA' },
      ],
      payouts: [
        { payoutRate: 30, payoutStatus: 'ACCRUED' },
        { payoutRate: 20, payoutStatus: 'SETTLED' },
      ],
    });

    expect(kpis).toMatchObject({
      gbv: 150,
      payoutsAccrued: 30,
      payoutsSettled: 20,
      netRevenue: 100,
      takeRate: 0.6667,
      averageOrderValue: 75,
      paidCount: 2,
    });
    expect(kpis.byRail).toEqual([
      { rail: 'CARD', amount: 100, count: 1 },
      { rail: 'OPEN_BANKING_SEPA', amount: 50, count: 1 },
    ]);
  });

  it('guards against division by zero when nothing has been paid', () => {
    const kpis = calculateFinance({ paid: [], payouts: [] });

    expect(kpis.gbv).toBe(0);
    expect(kpis.takeRate).toBe(0);
    expect(kpis.averageOrderValue).toBe(0);
  });
});

describe('calculateOperations', () => {
  it('computes acceptance, timeout, latency, and the funnel', () => {
    const offeredAt = new Date('2026-09-20T10:00:00Z');
    const kpis = calculateOperations({
      offers: [
        {
          status: 'ACCEPTED',
          offeredAt,
          respondedAt: new Date('2026-09-20T10:10:00Z'),
        },
        { status: 'DECLINED', offeredAt, respondedAt: null },
        { status: 'TIMEOUT', offeredAt, respondedAt: null },
        { status: 'OFFERED', offeredAt, respondedAt: null },
      ],
      reservations: [
        { status: 'CONFIRMED' },
        { status: 'CONFIRMED' },
        { status: 'DRAFT' },
      ],
    });

    expect(kpis).toMatchObject({
      offers: 4,
      accepted: 1,
      declined: 1,
      timedOut: 1,
      pending: 1,
      acceptanceRate: 0.25,
      timeoutRate: 0.25,
      averageResponseMinutes: 10,
    });
    expect(kpis.funnel).toHaveLength(RESERVATION_STATUSES.length);
    expect(kpis.funnel.find((row) => row.status === 'CONFIRMED')?.count).toBe(2);
  });
});

describe('calculateQuality', () => {
  it('averages ratings and counts incidents', () => {
    expect(calculateQuality({ ratings: [4, 5], incidentCount: 1 })).toEqual({
      reviewCount: 2,
      averageRating: 4.5,
      incidentCount: 1,
    });
  });

  it('returns a zero rating with no reviews', () => {
    expect(calculateQuality({ ratings: [], incidentCount: 0 }).averageRating).toBe(0);
  });
});

describe('calculateGeography', () => {
  it('counts services per province, most booked first', () => {
    expect(
      calculateGeography([
        { province: 'La Habana' },
        { province: null },
        { province: 'La Habana' },
      ]),
    ).toEqual([
      { province: 'La Habana', count: 2 },
      { province: 'Unspecified', count: 1 },
    ]);
  });
});

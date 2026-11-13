import { describe, expect, it } from 'vitest';

import { calculateSupplierReliability, meetsReliabilityFloor } from '../src';

const offeredAt = new Date('2026-09-20T10:00:00Z');

describe('calculateSupplierReliability', () => {
  it('computes acceptance, timeout, and latency per supplier', () => {
    const scorecards = calculateSupplierReliability([
      {
        supplierId: 'a',
        status: 'ACCEPTED',
        offeredAt,
        respondedAt: new Date('2026-09-20T10:10:00Z'),
      },
      { supplierId: 'a', status: 'DECLINED', offeredAt, respondedAt: null },
      { supplierId: 'b', status: 'TIMEOUT', offeredAt, respondedAt: null },
      { supplierId: 'b', status: 'TIMEOUT', offeredAt, respondedAt: null },
    ]);

    expect(scorecards).toHaveLength(2);
    expect(scorecards[0]).toMatchObject({
      supplierId: 'a',
      offers: 2,
      accepted: 1,
      declined: 1,
      timedOut: 0,
      acceptanceRate: 0.5,
      timeoutRate: 0,
      averageResponseMinutes: 10,
    });
    expect(scorecards[1]).toMatchObject({
      supplierId: 'b',
      offers: 2,
      acceptanceRate: 0,
      timeoutRate: 1,
    });
  });

  it('sorts best acceptance first and handles no offers', () => {
    const scorecards = calculateSupplierReliability([
      { supplierId: 'low', status: 'TIMEOUT', offeredAt, respondedAt: null },
      { supplierId: 'high', status: 'ACCEPTED', offeredAt, respondedAt: offeredAt },
    ]);

    expect(scorecards.map((row) => row.supplierId)).toEqual(['high', 'low']);
    expect(calculateSupplierReliability([])).toEqual([]);
  });

  it('rates over answered offers, so an open or cancelled offer is not a refusal', () => {
    const [card] = calculateSupplierReliability([
      { supplierId: 'a', status: 'ACCEPTED', offeredAt, respondedAt: offeredAt },
      { supplierId: 'a', status: 'OFFERED', offeredAt, respondedAt: null },
      { supplierId: 'a', status: 'CANCELLED', offeredAt, respondedAt: null },
    ]);
    expect(card).toMatchObject({ offers: 3, answered: 1, acceptanceRate: 1 });
  });
});

describe('meetsReliabilityFloor (auto-dispatch)', () => {
  it('keeps a supplier at or above 85 %', () => {
    expect(meetsReliabilityFloor({ answered: 20, acceptanceRate: 0.85 })).toBe(true);
  });

  it('drops a supplier below 85 % once they answered 5 offers', () => {
    expect(meetsReliabilityFloor({ answered: 5, acceptanceRate: 0.8 })).toBe(false);
  });

  it('does not judge a supplier on fewer than 5 answers, or none', () => {
    expect(meetsReliabilityFloor({ answered: 4, acceptanceRate: 0 })).toBe(true);
    expect(meetsReliabilityFloor(null)).toBe(true);
  });

  it('takes the floor and the minimum as parameters (M9 thresholds)', () => {
    expect(meetsReliabilityFloor({ answered: 3, acceptanceRate: 0.7 }, 0.75, 3)).toBe(
      false,
    );
  });
});

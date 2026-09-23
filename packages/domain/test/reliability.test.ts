import { describe, expect, it } from 'vitest';

import { calculateSupplierReliability } from '../src';

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
});

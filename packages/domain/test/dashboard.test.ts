import { describe, expect, it } from 'vitest';

import {
  ServiceItemStatus,
  agingBucket,
  bookingMix,
  isAwaitingWorker,
  monthRange,
  pendingConfirmations,
  relativeChange,
  serviceItemAlert,
  timerElapsed,
  zonedMidnight,
} from '../src';

const NOW = new Date('2026-10-14T18:00:00Z');
const hoursAgo = (n: number): Date => new Date(NOW.getTime() - n * 60 * 60 * 1000);

describe('agingBucket', () => {
  it('puts a wait in the bucket whose upper bound it has not reached', () => {
    expect(agingBucket(hoursAgo(0), NOW)).toBe('upTo2h');
    expect(agingBucket(hoursAgo(1.99), NOW)).toBe('upTo2h');
    expect(agingBucket(hoursAgo(2), NOW)).toBe('upTo6h');
    expect(agingBucket(hoursAgo(6), NOW)).toBe('upTo24h');
    expect(agingBucket(hoursAgo(23.9), NOW)).toBe('upTo24h');
    expect(agingBucket(hoursAgo(24), NOW)).toBe('over24h');
    expect(agingBucket(hoursAgo(200), NOW)).toBe('over24h');
  });

  it('treats a start in the future (clock skew) as just started', () => {
    expect(agingBucket(hoursAgo(-1), NOW)).toBe('upTo2h');
  });
});

describe('pendingConfirmations', () => {
  it('counts only bookings with an item not yet accepted, by how long they waited', () => {
    const result = pendingConfirmations(
      [
        { waitingSince: hoursAgo(1), itemStatuses: ['ACCEPTED', 'OFFERED'] },
        { waitingSince: hoursAgo(3), itemStatuses: ['DECLINED'] },
        { waitingSince: hoursAgo(30), itemStatuses: ['UNASSIGNED', 'TIMEOUT'] },
        // Every item secured: invoicing, no longer waiting on a worker.
        { waitingSince: hoursAgo(10), itemStatuses: ['ACCEPTED', 'FULFILLED'] },
      ],
      NOW,
    );

    expect(result).toEqual({
      total: 3,
      buckets: { upTo2h: 1, upTo6h: 1, upTo24h: 0, over24h: 1 },
    });
  });

  it('is empty with nothing on the desk', () => {
    expect(pendingConfirmations([], NOW)).toEqual({
      total: 0,
      buckets: { upTo2h: 0, upTo6h: 0, upTo24h: 0, over24h: 0 },
    });
  });
});

describe('isAwaitingWorker', () => {
  it('is false once every item is accepted or fulfilled', () => {
    expect(isAwaitingWorker([ServiceItemStatus.Accepted])).toBe(false);
    expect(isAwaitingWorker([ServiceItemStatus.Offered])).toBe(true);
  });
});

describe('timerElapsed', () => {
  it('is the used share of the offer window, clamped to 0–1', () => {
    const offeredAt = hoursAgo(1.52);
    const deadline = new Date(offeredAt.getTime() + 2 * 60 * 60 * 1000);
    expect(timerElapsed(offeredAt, deadline, NOW)).toBeCloseTo(0.76, 5);
    expect(timerElapsed(offeredAt, deadline, hoursAgo(2))).toBe(0);
    expect(timerElapsed(offeredAt, deadline, new Date(deadline.getTime() + 1))).toBe(1);
  });

  it('counts an empty window as used up', () => {
    expect(timerElapsed(NOW, NOW, NOW)).toBe(1);
  });
});

describe('serviceItemAlert', () => {
  const offeredAt = hoursAgo(1.6);
  const deadline = new Date(offeredAt.getTime() + 2 * 60 * 60 * 1000);

  it('is red once a worker declined or the offer timed out', () => {
    expect(serviceItemAlert({ status: 'DECLINED', offeredAt, deadline, now: NOW })).toBe(
      'RED',
    );
    expect(
      serviceItemAlert({ status: 'TIMEOUT', offeredAt: null, deadline: null, now: NOW }),
    ).toBe('RED');
  });

  it('follows the open offer’s clock: amber from 75 %', () => {
    expect(serviceItemAlert({ status: 'OFFERED', offeredAt, deadline, now: NOW })).toBe(
      'AMBER',
    );
    expect(
      serviceItemAlert({ status: 'OFFERED', offeredAt, deadline, now: hoursAgo(1) }),
    ).toBe('NONE');
  });

  it('raises nothing for settled or unoffered items', () => {
    for (const status of ['ACCEPTED', 'FULFILLED', 'UNASSIGNED'] as const) {
      expect(serviceItemAlert({ status, offeredAt, deadline, now: NOW })).toBe('NONE');
    }
  });
});

describe('bookingMix', () => {
  it('splits a funnel into confirmed, pipeline and cancelled, leaving drafts out', () => {
    expect(
      bookingMix([
        { status: 'DRAFT', count: 5 },
        { status: 'ITINERARY_SUBMITTED', count: 2 },
        { status: 'ACTION_REQUIRED', count: 1 },
        { status: 'PENDING_PAYMENT', count: 3 },
        { status: 'CONFIRMED', count: 4 },
        { status: 'IN_PROGRESS', count: 1 },
        { status: 'COMPLETED', count: 2 },
        { status: 'CANCELLED', count: 1 },
      ]),
    ).toEqual({ confirmed: 7, pipeline: 6, cancelled: 1 });
  });
});

describe('relativeChange', () => {
  it('is the change as a fraction, or null with no base to compare', () => {
    expect(relativeChange(23, 20)).toBeCloseTo(0.15, 5);
    expect(relativeChange(10, 20)).toBe(-0.5);
    expect(relativeChange(4, 0)).toBeNull();
  });
});

describe('monthRange (Havana)', () => {
  it('spans the Havana calendar month, in daylight time', () => {
    const october = monthRange(NOW);
    expect(october.year).toBe(2026);
    expect(october.month).toBe(10);
    expect(october.from.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(october.to.toISOString()).toBe('2026-11-01T03:59:59.999Z');
  });

  it('moves by whole months and across the year, in standard time', () => {
    const september = monthRange(NOW, -1);
    expect(september.from.toISOString()).toBe('2026-09-01T04:00:00.000Z');
    expect(september.to.toISOString()).toBe('2026-10-01T03:59:59.999Z');

    const january = monthRange(new Date('2027-01-01T03:00:00Z'), 0);
    // 03:00Z on 1 Jan is still 31 Dec in Havana (UTC−5).
    expect(january.month).toBe(12);
    expect(january.year).toBe(2026);
    expect(monthRange(NOW, 3).from.toISOString()).toBe('2027-01-01T05:00:00.000Z');
  });

  it('starts on the first midnight even on the night daylight time ends', () => {
    // Cuba falls back at 01:00 on the first Sunday of November (1 Nov 2026).
    expect(zonedMidnight(2026, 11, 1).toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(zonedMidnight(2026, 11, 2).toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });
});

import { describe, expect, it } from 'vitest';

import {
  WORKER_EARNINGS_HISTORY,
  isFinishedJob,
  workerEarnings,
  workerPayoutState,
  workerReliability,
  type WorkerEarningsJob,
} from '../src';

const NOW = new Date('2026-11-11T15:00:00Z');

function job(overrides: Partial<WorkerEarningsJob> = {}): WorkerEarningsJob {
  return {
    status: 'ACCEPTED',
    reservationStatus: 'CONFIRMED',
    endsAt: new Date('2026-11-05T18:00:00Z'),
    payoutCents: 9000,
    payoutStatus: 'ACCRUED',
    ...overrides,
  };
}

function offer(status: string) {
  return {
    supplierId: 's1',
    status,
    offeredAt: new Date('2026-10-01T10:00:00Z'),
    respondedAt: status === 'ACCEPTED' ? new Date('2026-10-01T10:20:00Z') : null,
  };
}

describe('the worker’s earnings (W-Earnings)', () => {
  it('counts a taken job once its service has ended, unless the booking was cancelled', () => {
    expect(isFinishedJob(job(), NOW)).toBe(true);
    expect(isFinishedJob(job({ status: 'FULFILLED' }), NOW)).toBe(true);
    expect(isFinishedJob(job({ endsAt: new Date('2026-11-12T10:00:00Z') }), NOW)).toBe(
      false,
    );
    expect(isFinishedJob(job({ reservationStatus: 'CANCELLED' }), NOW)).toBe(false);
    expect(isFinishedJob(job({ status: 'DECLINED' }), NOW)).toBe(false);
    expect(isFinishedJob(job({ status: 'OFFERED' }), NOW)).toBe(false);
  });

  it('reads accrued and processing as pending, settled as paid, failed as an issue', () => {
    expect(workerPayoutState('ACCRUED')).toBe('PENDING');
    expect(workerPayoutState('PROCESSING')).toBe('PENDING');
    expect(workerPayoutState('SETTLED')).toBe('PAID');
    expect(workerPayoutState('FAILED')).toBe('ISSUE');
  });

  it('sums pending, this month, paid this year and issues in exact cents', () => {
    const earnings = workerEarnings(
      [
        job({ payoutCents: 9010 }),
        job({ payoutCents: 2520, payoutStatus: 'PROCESSING' }),
        job({ payoutCents: 6000, payoutStatus: 'SETTLED' }),
        job({
          payoutCents: 18000,
          payoutStatus: 'SETTLED',
          endsAt: new Date('2026-09-21T20:00:00Z'),
        }),
        job({
          payoutCents: 4000,
          payoutStatus: 'SETTLED',
          endsAt: new Date('2025-12-20T20:00:00Z'),
        }),
        job({ payoutCents: 3000, payoutStatus: 'FAILED' }),
        // Not finished: still to come, or cancelled.
        job({ payoutCents: 99900, endsAt: new Date('2026-11-20T10:00:00Z') }),
        job({ payoutCents: 99900, reservationStatus: 'CANCELLED' }),
      ],
      NOW,
    );

    expect(earnings.pending).toEqual({ cents: 11530, jobs: 2 });
    expect(earnings.paidThisYear).toEqual({ cents: 24000, jobs: 2 });
    expect(earnings.issue).toEqual({ cents: 3000, jobs: 1 });
    // Everything that ended in November, paid or not.
    expect(earnings.thisMonth).toEqual({ cents: 20530, jobs: 4 });
    expect(earnings.year).toBe(2026);
  });

  it('puts a job that ended on the evening of the 31st in Havana in that month, not UTC’s next', () => {
    // 02:00 UTC on 1 November is still 31 October in Havana.
    const earnings = workerEarnings(
      [job({ endsAt: new Date('2026-11-01T02:00:00Z') })],
      NOW,
    );
    expect(earnings.thisMonth).toEqual({ cents: 0, jobs: 0 });
    expect(earnings.pending.jobs).toBe(1);
  });

  it('lists the newest finished jobs first, up to the history size', () => {
    const jobs = Array.from({ length: WORKER_EARNINGS_HISTORY + 5 }, (_, index) =>
      job({ endsAt: new Date(Date.UTC(2026, 9, 1 + index, 18)) }),
    );
    const { history } = workerEarnings(jobs, NOW);
    expect(history).toHaveLength(WORKER_EARNINGS_HISTORY);
    expect(history[0]!.endsAt.toISOString()).toBe('2026-10-25T18:00:00.000Z');
    expect(history[0]!.payoutState).toBe('PENDING');
  });
});

describe('the worker’s reliability (W-Earnings)', () => {
  it('splits answered offers into accepted, declined and no answer, ignoring open ones', () => {
    const view = workerReliability(
      [
        ...Array.from({ length: 17 }, () => offer('ACCEPTED')),
        offer('DECLINED'),
        offer('DECLINED'),
        offer('TIMEOUT'),
        offer('OFFERED'),
        offer('CANCELLED'),
      ],
      85,
      5,
    );
    expect(view).toEqual({
      answered: 20,
      score: 85,
      acceptedPercent: 85,
      declinedPercent: 10,
      timedOutPercent: 5,
      minAnswered: 5,
      floorPercent: 85,
      meetsFloor: true,
    });
  });

  it('gives no score and keeps automatic offers before enough answers', () => {
    const view = workerReliability([offer('DECLINED'), offer('TIMEOUT')], 85, 5);
    expect(view.score).toBeNull();
    expect(view.meetsFloor).toBe(true);
    expect(view.declinedPercent).toBe(50);
  });

  it('falls below the desk’s floor as the desk reads it', () => {
    const offers = [
      ...Array.from({ length: 4 }, () => offer('ACCEPTED')),
      offer('TIMEOUT'),
    ];
    expect(workerReliability(offers, 85, 5)).toMatchObject({
      score: 80,
      meetsFloor: false,
    });
    expect(workerReliability(offers, 80, 5).meetsFloor).toBe(true);
  });

  it('reads an empty ledger as nothing answered yet', () => {
    expect(workerReliability([], 85, 5)).toMatchObject({
      answered: 0,
      score: null,
      acceptedPercent: 0,
      meetsFloor: true,
    });
  });
});

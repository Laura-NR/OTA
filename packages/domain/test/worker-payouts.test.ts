import { describe, expect, it } from 'vitest';

import {
  PAYOUT_MAX_JOBS,
  nextPayDay,
  payoutAmountCents,
  payoutDueDay,
  payoutRecordRefusal,
  workerEarnings,
  type PayoutCandidate,
  type PayoutRule,
} from '../src';

// The board's office: Saturdays 10:00–13:00, paid 5 business days after a job ends.
const RULE: PayoutRule = {
  businessDays: 5,
  sessions: [{ weekday: 6, from: '10:00', to: '13:00' }],
};

function job(overrides: Partial<PayoutCandidate> = {}): PayoutCandidate {
  return {
    supplierId: 's1',
    payoutId: null,
    status: 'ACCEPTED',
    reservationStatus: 'CONFIRMED',
    // Thursday 1 October, 14:00 in Havana.
    endsAt: new Date('2026-10-01T18:00:00Z'),
    payoutCents: 2500,
    payoutStatus: 'ACCRUED',
    ...overrides,
  };
}

describe('the pay rule (W-Earnings E4)', () => {
  it('falls due five Monday-to-Friday days after the Havana day the job ended', () => {
    expect(payoutDueDay(new Date('2026-10-01T18:00:00Z'), 5)).toBe('2026-10-08');
    // Saturday 3 October: the weekend is not counted.
    expect(payoutDueDay(new Date('2026-10-03T18:00:00Z'), 5)).toBe('2026-10-09');
    // 22:00 on 1 October in Havana is already the 2nd in UTC.
    expect(payoutDueDay(new Date('2026-10-02T02:00:00Z'), 5)).toBe('2026-10-08');
  });

  it('pays at the first office session on or after the earliest due day', () => {
    const jobs = [job(), job({ endsAt: new Date('2026-10-03T18:00:00Z') })];
    expect(nextPayDay(jobs, new Date('2026-10-05T12:00:00Z'), RULE)).toEqual({
      day: '2026-10-10',
      from: '10:00',
      to: '13:00',
    });
  });

  it('moves to the next session once today’s has closed in Havana', () => {
    const jobs = [job()];
    // 11:00 in Havana (UTC-4 in October): the session is still open.
    expect(nextPayDay(jobs, new Date('2026-10-10T15:00:00Z'), RULE)?.day).toBe(
      '2026-10-10',
    );
    // 15:00 in Havana: it closed at 13:00.
    expect(nextPayDay(jobs, new Date('2026-10-10T19:00:00Z'), RULE)?.day).toBe(
      '2026-10-17',
    );
  });

  it('waits for a job that is not yet due', () => {
    const jobs = [job({ endsAt: new Date('2026-10-08T18:00:00Z') })];
    expect(nextPayDay(jobs, new Date('2026-10-09T12:00:00Z'), RULE)?.day).toBe(
      '2026-10-17',
    );
  });

  it('has no pay day without a pending job or an office session', () => {
    const now = new Date('2026-10-05T12:00:00Z');
    expect(nextPayDay([job({ payoutStatus: 'SETTLED' })], now, RULE)).toBeNull();
    // A failed payout waits for the desk, not for the next session.
    expect(nextPayDay([job({ payoutStatus: 'FAILED' })], now, RULE)).toBeNull();
    expect(nextPayDay([job({ reservationStatus: 'CANCELLED' })], now, RULE)).toBeNull();
    expect(nextPayDay([job()], now, { ...RULE, sessions: [] })).toBeNull();
  });
});

describe('recording a payment (W-Earnings E1)', () => {
  const NOW = new Date('2026-10-10T15:00:00Z');

  it('accepts finished, unpaid jobs of this worker paid between their end and today', () => {
    expect(payoutRecordRefusal('s1', 2, [job(), job()], '2026-10-10', NOW)).toBeNull();
    // A failed payout is paid by a new payment.
    expect(
      payoutRecordRefusal('s1', 1, [job({ payoutStatus: 'FAILED' })], '2026-10-01', NOW),
    ).toBeNull();
  });

  it('refuses an empty or oversized payment', () => {
    expect(payoutRecordRefusal('s1', 0, [], '2026-10-10', NOW)).toBe('NO_JOBS');
    expect(payoutRecordRefusal('s1', PAYOUT_MAX_JOBS + 1, [], '2026-10-10', NOW)).toBe(
      'TOO_MANY_JOBS',
    );
  });

  it('refuses jobs it did not find or that belong to another worker', () => {
    expect(payoutRecordRefusal('s1', 2, [job()], '2026-10-10', NOW)).toBe(
      'NOT_THIS_WORKER',
    );
    expect(
      payoutRecordRefusal('s1', 1, [job({ supplierId: 's2' })], '2026-10-10', NOW),
    ).toBe('NOT_THIS_WORKER');
  });

  it('refuses a cancelled booking, a job not yet ended and a job already paid', () => {
    expect(
      payoutRecordRefusal(
        's1',
        1,
        [job({ reservationStatus: 'CANCELLED' })],
        '2026-10-10',
        NOW,
      ),
    ).toBe('CANCELLED');
    expect(
      payoutRecordRefusal(
        's1',
        1,
        [job({ endsAt: new Date('2026-10-11T18:00:00Z') })],
        '2026-10-10',
        NOW,
      ),
    ).toBe('NOT_FINISHED');
    expect(
      payoutRecordRefusal('s1', 1, [job({ status: 'DECLINED' })], '2026-10-10', NOW),
    ).toBe('NOT_FINISHED');
    expect(
      payoutRecordRefusal('s1', 1, [job({ payoutStatus: 'SETTLED' })], '2026-10-10', NOW),
    ).toBe('ALREADY_PAID');
    expect(
      payoutRecordRefusal('s1', 1, [job({ payoutId: 'p1' })], '2026-10-10', NOW),
    ).toBe('ALREADY_PAID');
  });

  it('refuses a paid day after today or before the job ended, on Havana’s calendar', () => {
    expect(payoutRecordRefusal('s1', 1, [job()], '2026-10-11', NOW)).toBe(
      'PAID_IN_FUTURE',
    );
    expect(payoutRecordRefusal('s1', 1, [job()], '2026-09-30', NOW)).toBe(
      'PAID_BEFORE_END',
    );
    // Ended 22:00 on 1 October in Havana: paying on the 1st is fine.
    expect(
      payoutRecordRefusal(
        's1',
        1,
        [job({ endsAt: new Date('2026-10-02T02:00:00Z') })],
        '2026-10-01',
        NOW,
      ),
    ).toBeNull();
  });

  it('hands over the jobs’ payouts summed in exact cents', () => {
    expect(payoutAmountCents([{ payoutCents: 9010 }, { payoutCents: 2520 }])).toBe(11530);
  });
});

describe('"Pagado en" by the paid date', () => {
  it('counts a job in the year its payment was made, not the year it ended', () => {
    const now = new Date('2026-01-20T15:00:00Z');
    const earnings = workerEarnings(
      [
        job({
          endsAt: new Date('2025-12-30T18:00:00Z'),
          payoutStatus: 'SETTLED',
          paidAt: new Date('2026-01-05T00:00:00Z'),
          payoutCents: 6000,
        }),
        job({
          endsAt: new Date('2025-12-20T18:00:00Z'),
          payoutStatus: 'SETTLED',
          paidAt: new Date('2025-12-27T00:00:00Z'),
          payoutCents: 1000,
        }),
      ],
      now,
    );
    expect(earnings.paidThisYear).toEqual({ cents: 6000, jobs: 1 });
  });

  it('reads the stored day as a calendar day, not shifted to Havana', () => {
    const earnings = workerEarnings(
      [
        job({
          endsAt: new Date('2025-12-30T18:00:00Z'),
          payoutStatus: 'SETTLED',
          // Midnight UTC is still 31 December in Havana; the day kept is 1 January.
          paidAt: new Date('2026-01-01T00:00:00Z'),
        }),
      ],
      new Date('2026-01-20T15:00:00Z'),
    );
    expect(earnings.paidThisYear.jobs).toBe(1);
  });
});

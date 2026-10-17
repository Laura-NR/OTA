import { describe, expect, it } from 'vitest';

import {
  addBusinessDays,
  buildSchedule,
  cancellationRefund,
  cardFee,
  depositEligible,
  refundDecision,
  type CancellationBand,
} from '../src';

const policy = {
  percent: 20,
  minDaysBeforeDeparture: 60,
  balanceDaysBeforeDeparture: 30,
};
const departure = new Date('2027-02-13T00:00:00Z');
const now = new Date('2026-10-17T10:00:00Z');

describe('payment schedule', () => {
  it('offers a deposit only when departure is more than the policy days away', () => {
    expect(depositEligible(policy, departure, now)).toBe(true);
    expect(depositEligible(policy, departure, new Date('2026-12-15T10:00:00Z'))).toBe(
      false,
    );
    expect(depositEligible(null, departure, now)).toBe(false);
  });

  it('splits a deposit and a balance that add up to the total', () => {
    const schedule = buildSchedule({
      total: 3100.05,
      plan: 'DEPOSIT',
      policy,
      departure,
      now,
      windowHours: 48,
    });

    expect(schedule).toEqual([
      { kind: 'DEPOSIT', amount: 620.01, dueAt: new Date('2026-10-19T10:00:00Z') },
      // The boards' 13 Feb trip has its balance due on 14 Jan.
      { kind: 'BALANCE', amount: 2480.04, dueAt: new Date('2027-01-14T00:00:00Z') },
    ]);
    expect(schedule![0]!.amount + schedule![1]!.amount).toBeCloseTo(3100.05, 2);
  });

  it('asks for the full amount when the window closes, and refuses a deposit too late', () => {
    expect(
      buildSchedule({
        total: 900,
        plan: 'FULL',
        policy,
        departure,
        now,
        windowHours: 48,
      }),
    ).toEqual([{ kind: 'FULL', amount: 900, dueAt: new Date('2026-10-19T10:00:00Z') }]);
    expect(
      buildSchedule({
        total: 900,
        plan: 'DEPOSIT',
        policy,
        departure,
        now: new Date('2027-01-01T00:00:00Z'),
        windowHours: 48,
      }),
    ).toBeNull();
  });

  it('charges the card fee as a percentage, rounded to the cent', () => {
    expect(cardFee(620, 3)).toBe(18.6);
    expect(cardFee(620, 0)).toBe(0);
  });

  it('extends a window by working days, skipping the weekend', () => {
    // Friday 16 Oct 2026, 09:14 → Monday 19 Oct.
    expect(addBusinessDays(new Date('2026-10-16T09:14:00Z'), 1)).toEqual(
      new Date('2026-10-19T09:14:00Z'),
    );
  });
});

describe('cancellation refund', () => {
  const bands: CancellationBand[] = [
    { fromDays: 46, keepPercent: 0, fee: 60 },
    { fromDays: 31, keepPercent: 10, fee: 0 },
    { fromDays: 15, keepPercent: 25, fee: 0 },
    { fromDays: 0, keepPercent: 100, fee: 0 },
  ];

  it('keeps the band share of what was paid, as A-Payments works it', () => {
    // Cancelled 22 days out, € 590 paid: 25 % kept, € 442.50 back.
    expect(cancellationRefund(bands, 590, 22)).toMatchObject({
      band: { fromDays: 15, keepPercent: 25 },
      kept: 147.5,
      refund: 442.5,
    });
  });

  it('keeps only the fixed fee early on, and never more than was paid', () => {
    expect(cancellationRefund(bands, 1000, 90)).toMatchObject({ kept: 60, refund: 940 });
    expect(cancellationRefund(bands, 40, 90)).toMatchObject({ kept: 40, refund: 0 });
  });

  it('has no answer when no band covers the day', () => {
    expect(cancellationRefund([], 500, 10)).toBeNull();
    expect(cancellationRefund(bands.slice(0, 2), 500, 10)).toBeNull();
  });
});

describe('refund approvals', () => {
  const limits = { singleUpTo: 500, dualUpTo: 2000 };
  const ops = (id: string) => ({
    approverId: id,
    role: 'OPERATIONS_ADMIN',
    approve: true,
  });

  it('needs one approval up to the single limit', () => {
    expect(refundDecision(442.5, [], limits)).toEqual({
      state: 'PENDING',
      missing: 1,
      superAdmin: false,
    });
    expect(refundDecision(442.5, [ops('a')], limits)).toEqual({ state: 'APPROVED' });
  });

  it('needs two different people between the limits', () => {
    expect(refundDecision(1310, [ops('a')], limits)).toMatchObject({ missing: 1 });
    expect(refundDecision(1310, [ops('a'), ops('a')], limits)).toMatchObject({
      state: 'PENDING',
    });
    expect(refundDecision(1310, [ops('a'), ops('b')], limits)).toEqual({
      state: 'APPROVED',
    });
  });

  it('needs a Super Admin above the dual limit, and one rejection rejects', () => {
    expect(refundDecision(2500, [ops('a'), ops('b')], limits)).toEqual({
      state: 'PENDING',
      missing: 1,
      superAdmin: true,
    });
    expect(
      refundDecision(
        2500,
        [{ approverId: 'c', role: 'SUPER_ADMIN', approve: true }],
        limits,
      ),
    ).toEqual({ state: 'APPROVED' });
    expect(
      refundDecision(100, [ops('a'), { ...ops('b'), approve: false }], limits),
    ).toEqual({ state: 'REJECTED' });
  });
});

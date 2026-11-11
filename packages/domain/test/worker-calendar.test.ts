import { describe, expect, it } from 'vitest';

import {
  WORKER_BLOCK_MAX_DAYS,
  WORKER_LONG_BLOCK_DAYS,
  daysBetween,
  longBlockedRun,
  monthDays,
  planWorkerDays,
  shiftMonth,
  workerDayStates,
  workerDaysRefusal,
  workerHorizon,
  workerToday,
} from '../src';

describe('the worker calendar (W-Calendar)', () => {
  it('reads today on Havana’s clock, not UTC’s', () => {
    // 02:30 UTC on the 7th is still the 6th in Havana (UTC−5).
    expect(workerToday(new Date('2026-11-07T02:30:00Z'))).toBe('2026-11-06');
    expect(workerToday(new Date('2026-11-07T06:00:00Z'))).toBe('2026-11-07');
  });

  it('lists a month’s days, leap Februaries included', () => {
    expect(monthDays('2026-11')).toHaveLength(30);
    expect(monthDays('2028-02').at(-1)).toBe('2028-02-29');
    expect(monthDays('2026-12')[0]).toBe('2026-12-01');
  });

  it('moves between months across a year end', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
    expect(shiftMonth('2026-11', 12)).toBe('2027-11');
  });

  it('lets a worker reach the end of the twelfth month after this one', () => {
    expect(workerHorizon('2026-11-11')).toBe('2027-11-30');
    expect(workerHorizon('2026-01-31')).toBe('2027-01-31');
  });

  it('ranks a job over an offer over a block on the same day', () => {
    const states = workerDayStates(
      ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'],
      new Set(['2026-11-20', '2026-11-21', '2026-11-22']),
      [
        {
          start: new Date('2026-11-20T14:00:00Z'),
          end: new Date('2026-11-20T18:00:00Z'),
        },
      ],
      [
        {
          start: new Date('2026-11-20T00:00:00Z'),
          end: new Date('2026-11-21T00:00:00Z'),
        },
      ],
    );
    expect([...states.values()]).toEqual(['JOB', 'OFFER', 'BLOCKED', 'AVAILABLE']);
  });

  it('marks every day a several-day job covers, read on Havana’s calendar', () => {
    const states = workerDayStates(
      ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'],
      new Set(),
      // 01:00 UTC on the 10th is 20:00 on the 9th in Havana.
      [
        {
          start: new Date('2026-11-10T01:00:00Z'),
          end: new Date('2026-11-11T15:00:00Z'),
        },
      ],
      [],
    );
    expect(states.get('2026-11-09')).toBe('JOB');
    expect(states.get('2026-11-10')).toBe('JOB');
    expect(states.get('2026-11-11')).toBe('JOB');
    expect(states.get('2026-11-12')).toBe('AVAILABLE');
  });

  it('refuses a past day, a backwards range, a day past the horizon and a range over two months', () => {
    const today = '2026-11-11';
    expect(workerDaysRefusal('2026-11-11', '2026-11-11', today)).toBeNull();
    expect(workerDaysRefusal('2026-11-10', '2026-11-12', today)).toBe('PAST');
    expect(workerDaysRefusal('2026-11-14', '2026-11-12', today)).toBe('BAD_RANGE');
    expect(workerDaysRefusal('2027-11-30', '2027-12-01', today)).toBe('TOO_FAR');
    const last = daysBetween('2026-12-01', '2027-06-01')[WORKER_BLOCK_MAX_DAYS - 1]!;
    expect(workerDaysRefusal('2026-12-01', last, today)).toBeNull();
    const oneMore = daysBetween('2026-12-01', '2027-06-01')[WORKER_BLOCK_MAX_DAYS]!;
    expect(workerDaysRefusal('2026-12-01', oneMore, today)).toBe('TOO_MANY_DAYS');
  });

  it('leaves days with a job or an open offer as they are when a range is changed', () => {
    const days = daysBetween('2026-11-20', '2026-11-23');
    const states = new Map([
      ['2026-11-20', 'AVAILABLE'],
      ['2026-11-21', 'JOB'],
      ['2026-11-22', 'OFFER'],
      ['2026-11-23', 'BLOCKED'],
    ] as const);
    expect(planWorkerDays(days, states)).toEqual({
      change: ['2026-11-20', '2026-11-23'],
      kept: ['2026-11-21', '2026-11-22'],
    });
  });

  it('flags a run longer than fourteen blocked days, and not one of exactly fourteen', () => {
    const today = '2026-11-11';
    const fourteen = daysBetween('2026-12-01', '2026-12-14');
    expect(fourteen).toHaveLength(WORKER_LONG_BLOCK_DAYS);
    expect(longBlockedRun(fourteen, today)).toBeNull();
    expect(longBlockedRun([...fourteen, '2026-12-15'], today)).toEqual({
      from: '2026-12-01',
      to: '2026-12-15',
      days: 15,
    });
  });

  it('counts a run across a month end, ignores gaps, and leaves days before today out', () => {
    const today = '2026-11-25';
    const across = daysBetween('2026-11-20', '2026-12-12');
    expect(longBlockedRun(across, today)).toEqual({
      from: '2026-11-25',
      to: '2026-12-12',
      days: 18,
    });
    const gapped = [
      ...daysBetween('2026-12-01', '2026-12-08'),
      ...daysBetween('2026-12-10', '2026-12-17'),
    ];
    expect(longBlockedRun(gapped, today)).toBeNull();
    expect(longBlockedRun([], today)).toBeNull();
  });
});

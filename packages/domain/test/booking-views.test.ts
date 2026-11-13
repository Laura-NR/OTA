import { describe, expect, it } from 'vitest';

import {
  BOOKING_PIPELINE,
  compareUrgency,
  inTravelWindow,
  isArrivingWithin,
  pipelinePosition,
  zonedCalendarDay,
  type BookingUrgency,
} from '../src';

// 23:30 on 14 Oct in Havana is already 15 Oct in UTC.
const NOW = new Date('2026-10-15T03:30:00Z');
const day = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

describe('zonedCalendarDay', () => {
  it('is the Havana calendar day, not the UTC one', () => {
    expect(zonedCalendarDay(NOW).toISOString()).toBe('2026-10-14T00:00:00.000Z');
  });
});

describe('inTravelWindow', () => {
  const booking = (start: string, end = start) => ({
    startDate: day(start),
    endDate: day(end),
  });

  it('counts the next 30 or 90 days from today, today included', () => {
    expect(inTravelWindow(booking('2026-10-14'), 'next30', NOW)).toBe(true);
    expect(inTravelWindow(booking('2026-11-13'), 'next30', NOW)).toBe(true);
    expect(inTravelWindow(booking('2026-11-14'), 'next30', NOW)).toBe(false);
    expect(inTravelWindow(booking('2026-11-14'), 'next90', NOW)).toBe(true);
    expect(inTravelWindow(booking('2026-10-13'), 'next90', NOW)).toBe(false);
  });

  it('takes this month as the Havana month the booking starts in', () => {
    expect(inTravelWindow(booking('2026-10-01'), 'thisMonth', NOW)).toBe(true);
    expect(inTravelWindow(booking('2026-11-01'), 'thisMonth', NOW)).toBe(false);
  });

  it('takes the past as bookings that ended before today', () => {
    expect(inTravelWindow(booking('2026-10-01', '2026-10-13'), 'past', NOW)).toBe(true);
    expect(inTravelWindow(booking('2026-10-01', '2026-10-14'), 'past', NOW)).toBe(false);
  });
});

describe('isArrivingWithin', () => {
  it('holds live bookings that start within the next 7 days', () => {
    expect(isArrivingWithin(day('2026-10-14'), 'CONFIRMED', NOW)).toBe(true);
    expect(isArrivingWithin(day('2026-10-21'), 'PENDING_PAYMENT', NOW)).toBe(true);
    expect(isArrivingWithin(day('2026-10-22'), 'CONFIRMED', NOW)).toBe(false);
    expect(isArrivingWithin(day('2026-10-13'), 'CONFIRMED', NOW)).toBe(false);
  });

  it('leaves out cancelled and completed bookings', () => {
    expect(isArrivingWithin(day('2026-10-15'), 'CANCELLED', NOW)).toBe(false);
    expect(isArrivingWithin(day('2026-10-15'), 'COMPLETED', NOW)).toBe(false);
  });
});

describe('compareUrgency', () => {
  const at = (iso: string) => new Date(iso);
  const row = (overrides: Partial<BookingUrgency>): BookingUrgency => ({
    alert: 'NONE',
    deadline: null,
    startDate: day('2027-01-01'),
    ...overrides,
  });

  it('puts red before amber before the rest, then the soonest deadline, then the soonest start', () => {
    const rows = {
      calm: row({ startDate: day('2026-12-01') }),
      later: row({ startDate: day('2027-02-01') }),
      ticking: row({ deadline: at('2026-10-15T05:00:00Z') }),
      amber: row({ alert: 'AMBER', deadline: at('2026-10-15T04:00:00Z') }),
      red: row({ alert: 'RED' }),
    };
    const order = Object.entries(rows)
      .sort(([, a], [, b]) => compareUrgency(a, b))
      .map(([name]) => name);
    expect(order).toEqual(['red', 'amber', 'ticking', 'calm', 'later']);
  });
});

describe('pipelinePosition', () => {
  it('places each pipeline state at its own step', () => {
    BOOKING_PIPELINE.forEach((status, index) => {
      expect(pipelinePosition(status)?.index).toBe(index);
    });
    expect(pipelinePosition('COMPLETED')).toEqual({
      index: 7,
      blocked: false,
      finished: true,
    });
  });

  it('holds ACTION_REQUIRED at dispatch, blocked', () => {
    expect(pipelinePosition('ACTION_REQUIRED')).toEqual({
      index: 1,
      blocked: true,
      finished: false,
    });
  });

  it('starts a draft before the first step and takes a cancellation off the path', () => {
    expect(pipelinePosition('DRAFT')?.index).toBe(-1);
    expect(pipelinePosition('CANCELLED')).toBeNull();
  });
});

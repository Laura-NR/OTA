import { describe, expect, it } from 'vitest';

import { isFreeForService, serviceCalendarDay, serviceCalendarDays } from '../src';

describe('serviceCalendarDays', () => {
  it('reads a booking date (UTC midnight) as that calendar day', () => {
    const day = new Date('2026-11-02T00:00:00Z');
    expect(serviceCalendarDays(day, day)).toEqual(['2026-11-02']);
  });

  it('reads a clock time on its day in Havana', () => {
    // 01:30 UTC on 3 Nov is 20:30 on 2 Nov in Havana.
    expect(serviceCalendarDay(new Date('2026-11-03T01:30:00Z'))).toBe('2026-11-02');
    expect(serviceCalendarDay(new Date('2026-11-02T13:00:00Z'))).toBe('2026-11-02');
  });

  it('covers every day from the start to the end, both included', () => {
    expect(
      serviceCalendarDays(
        new Date('2026-11-01T00:00:00Z'),
        new Date('2026-11-04T00:00:00Z'),
      ),
    ).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
  });

  it('treats an end before the start as a one-day service', () => {
    expect(
      serviceCalendarDays(
        new Date('2026-11-04T00:00:00Z'),
        new Date('2026-11-01T00:00:00Z'),
      ),
    ).toEqual(['2026-11-04']);
  });
});

describe('isFreeForService', () => {
  const days = ['2026-11-01', '2026-11-02'];

  it('needs every service day free and the supplier available', () => {
    expect(isFreeForService(true, new Set(), days)).toBe(true);
    expect(isFreeForService(true, new Set(['2026-11-02']), days)).toBe(false);
    expect(isFreeForService(false, new Set(), days)).toBe(false);
  });

  it('ignores blocked days outside the service', () => {
    expect(isFreeForService(true, new Set(['2026-11-05']), days)).toBe(true);
  });
});

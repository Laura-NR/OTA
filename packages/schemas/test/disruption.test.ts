import { describe, expect, it } from 'vitest';

import {
  disruptionAttachSchema,
  disruptionCreateSchema,
  disruptionDeskChoiceSchema,
  disruptionOptionsWriteSchema,
  disruptionSafetySchema,
  disruptionUpdateSchema,
} from '../src';

describe('disruption write schemas', () => {
  it('opens a case without bookings unless some are named', () => {
    const parsed = disruptionCreateSchema.parse({
      scenario: 'outage',
      severity: 'MAJOR',
      province: 'CU01',
      title: 'Power outage · Viñales',
      summary: 'Province-wide outage since last night.',
    });
    expect(parsed.reservationIds).toEqual([]);
  });

  it('allows a case with no province (a flight)', () => {
    expect(
      disruptionCreateSchema.safeParse({
        scenario: 'flight',
        severity: 'MINOR',
        province: null,
        title: 'Flight cancellation',
        summary: 'Inbound flight cancelled.',
      }).success,
    ).toBe(true);
  });

  it('refuses an empty update and accepts closing alone', () => {
    expect(disruptionUpdateSchema.safeParse({}).success).toBe(false);
    expect(disruptionUpdateSchema.parse({ close: true })).toEqual({ close: true });
  });

  it('needs at least one booking to attach', () => {
    expect(disruptionAttachSchema.safeParse({}).success).toBe(false);
    expect(
      disruptionAttachSchema.parse({ bookingCodes: ['VX6RQ4JD'] }).reservationIds,
    ).toEqual([]);
  });

  it('keys the options A, B, C, D in order, at most four', () => {
    const option = (key: string) => ({
      key,
      title: `Option ${key}`,
      detail: 'No change to price',
    });
    expect(
      disruptionOptionsWriteSchema.safeParse({ options: [option('A'), option('B')] })
        .success,
    ).toBe(true);
    expect(
      disruptionOptionsWriteSchema.safeParse({ options: [option('A'), option('C')] })
        .success,
    ).toBe(false);
    expect(disruptionOptionsWriteSchema.safeParse({ options: [] }).success).toBe(false);
  });

  it('records a phone answer by default', () => {
    expect(disruptionDeskChoiceSchema.parse({ key: 'B' })).toEqual({
      key: 'B',
      source: 'DESK',
    });
    expect(
      disruptionDeskChoiceSchema.safeParse({ key: 'B', source: 'TRAVELER' }).success,
    ).toBe(false);
  });

  it('marks safety with an optional note and contact time', () => {
    const parsed = disruptionSafetySchema.parse({
      safety: 'SAFE',
      note: 'Lázaro by phone: both fine',
      contactAt: '2026-10-06T14:34:00Z',
    });
    expect(parsed.contactAt).toBeInstanceOf(Date);
    expect(disruptionSafetySchema.safeParse({ safety: 'LOST' }).success).toBe(false);
  });
});

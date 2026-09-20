import { ReservationStatus } from '@ota/domain';
import { describe, expect, it } from 'vitest';

import { transitionReservationSchema } from '../src';

describe('transitionReservationSchema', () => {
  it('accepts a known status with an optional reason', () => {
    const parsed = transitionReservationSchema.parse({
      to: ReservationStatus.DispatchInProgress,
      reason: 'manual dispatch',
    });

    expect(parsed.to).toBe(ReservationStatus.DispatchInProgress);
  });

  it('rejects an unknown status', () => {
    expect(() => transitionReservationSchema.parse({ to: 'MADE_UP' })).toThrowError();
  });

  it('rejects a reason longer than 500 characters', () => {
    expect(() =>
      transitionReservationSchema.parse({
        to: ReservationStatus.Confirmed,
        reason: 'x'.repeat(501),
      }),
    ).toThrowError();
  });
});

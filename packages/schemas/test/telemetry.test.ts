import { describe, expect, it } from 'vitest';

import { TELEMETRY_BATCH_MAX, telemetryBatchSchema } from '../src/telemetry';

const event = {
  event: 'page_view',
  ts: '2026-10-25T12:00:00Z',
  context: { app: 'web', screen: 'Home', consent: 'analytics' },
  params: { entry: true, referrer_host: 'example.org' },
};

describe('telemetryBatchSchema', () => {
  it('accepts a batch of events', () => {
    expect(telemetryBatchSchema.parse({ events: [event] }).events).toHaveLength(1);
  });

  it('refuses an empty batch, an oversized one, or unknown top-level fields', () => {
    expect(telemetryBatchSchema.safeParse({ events: [] }).success).toBe(false);
    expect(
      telemetryBatchSchema.safeParse({
        events: Array.from({ length: TELEMETRY_BATCH_MAX + 1 }, () => event),
      }).success,
    ).toBe(false);
    expect(
      telemetryBatchSchema.safeParse({ events: [{ ...event, userId: 'u1' }] }).success,
    ).toBe(false);
  });

  it('bounds the size of every value', () => {
    expect(
      telemetryBatchSchema.safeParse({
        events: [{ ...event, params: { referrer_host: 'x'.repeat(257) } }],
      }).success,
    ).toBe(false);
    expect(
      telemetryBatchSchema.safeParse({
        events: [{ ...event, context: { screen: { nested: true } } }],
      }).success,
    ).toBe(false);
  });
});

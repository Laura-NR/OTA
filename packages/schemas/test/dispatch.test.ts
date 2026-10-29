import { describe, expect, it } from 'vitest';

import { acknowledgeAlertSchema } from '../src/dispatch';

describe('acknowledgeAlertSchema', () => {
  it('names the offer whose alert is acknowledged, or none', () => {
    expect(
      acknowledgeAlertSchema.parse({ offeredAt: '2026-10-29T16:00:00.000Z' }).offeredAt,
    ).toBe('2026-10-29T16:00:00.000Z');
    expect(acknowledgeAlertSchema.parse({ offeredAt: null }).offeredAt).toBeNull();
  });

  it('refuses a body without the offer or with a date that is not one', () => {
    expect(() => acknowledgeAlertSchema.parse({})).toThrow();
    expect(() => acknowledgeAlertSchema.parse({ offeredAt: 'yesterday' })).toThrow();
  });
});

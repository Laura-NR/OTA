import { DEFAULT_OPERATING_THRESHOLDS } from '@ota/domain';
import { describe, expect, it } from 'vitest';

import {
  changeStaffRoleSchema,
  createInviteSchema,
  operatingThresholdsSchema,
} from '../src';

describe('M9 settings DTOs', () => {
  it('accepts the code defaults, so "Reset to spec defaults" is always a valid proposal', () => {
    expect(operatingThresholdsSchema.parse(DEFAULT_OPERATING_THRESHOLDS)).toEqual(
      DEFAULT_OPERATING_THRESHOLDS,
    );
  });

  it('bounds each value', () => {
    const bad = (patch: Record<string, unknown>) =>
      operatingThresholdsSchema.safeParse({ ...DEFAULT_OPERATING_THRESHOLDS, ...patch })
        .success;
    expect(bad({ amberPercent: 99 })).toBe(false);
    expect(bad({ retentionGraceDays: 7 })).toBe(false);
    expect(bad({ dispatchTimeoutMinutes: 1.5 })).toBe(false);
    expect(bad({ advisoryDualApprovalFrom: 'INFO' })).toBe(false);
  });

  it('invites staff roles only, and never promotes to Super Admin by a role change', () => {
    expect(
      createInviteSchema.safeParse({ email: 'yanet@vereda.travel', role: 'TRAVELER' })
        .success,
    ).toBe(false);
    expect(
      createInviteSchema.parse({ email: ' Yanet@Vereda.travel ', role: 'SUPER_ADMIN' }),
    ).toEqual({ email: 'yanet@vereda.travel', role: 'SUPER_ADMIN' });
    expect(changeStaffRoleSchema.safeParse({ role: 'SUPER_ADMIN' }).success).toBe(false);
  });
});

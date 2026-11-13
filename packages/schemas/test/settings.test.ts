import { DEFAULT_OPERATING_THRESHOLDS } from '@ota/domain';
import { describe, expect, it } from 'vitest';

import {
  changeStaffRoleSchema,
  createInviteSchema,
  operatingThresholdsSchema,
  resetPasskeysSchema,
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
    expect(bad({ staffPasskeysRequired: 'yes' })).toBe(false);
    expect(bad({ staffPasskeysRequired: true })).toBe(true);
  });

  it('bounds the display-currency spread to 0–3 % in steps of 0.1 (docs/schema-m9-display-currencies.md C5)', () => {
    const ok = (patch: Record<string, unknown>) =>
      operatingThresholdsSchema.safeParse({ ...DEFAULT_OPERATING_THRESHOLDS, ...patch })
        .success;
    expect(ok({ fxSpreadPercent: 0 })).toBe(true);
    expect(ok({ fxSpreadPercent: 0.7 })).toBe(true);
    expect(ok({ fxSpreadPercent: 3 })).toBe(true);
    expect(ok({ fxSpreadPercent: 0.65 })).toBe(false);
    expect(ok({ fxSpreadPercent: 3.1 })).toBe(false);
    expect(ok({ fxSpreadPercent: -0.1 })).toBe(false);
    expect(ok({ fxLockAt: 'INVOICE' })).toBe(true);
    expect(ok({ fxLockAt: 'BALANCE' })).toBe(false);
  });

  it('takes the Super Admin IP allowlist as labelled addresses and ranges (docs/schema-m9-ip-allowlist.md I2, I5)', () => {
    const list = (superAdminIpAllowlist: unknown) =>
      operatingThresholdsSchema.safeParse({
        ...DEFAULT_OPERATING_THRESHOLDS,
        superAdminIpAllowlistOn: true,
        superAdminIpAllowlist,
      });
    const parsed = list([
      { label: ' Havana office ', cidr: ' 203.0.113.0/24 ' },
      { label: 'VPN', cidr: '2001:db8:4::/48' },
      { label: 'Spain office', cidr: '192.0.2.7' },
    ]);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.superAdminIpAllowlist[0]).toEqual({
      label: 'Havana office',
      cidr: '203.0.113.0/24',
    });
    const message = (entries: unknown) =>
      list(entries).error?.issues.map((issue) => issue.message);
    expect(message([{ label: 'Office', cidr: 'havana' }])).toEqual([
      'Use an IPv4 or IPv6 address, or a range such as 203.0.113.0/24',
    ]);
    expect(message([{ label: 'Office', cidr: '2001:db8::1' }])).toEqual([
      'An IPv6 range must be a /64 or wider',
    ]);
    expect(
      message([
        { label: 'Office', cidr: '203.0.113.0/24' },
        { label: 'Office again', cidr: '203.0.113.0/24' },
      ]),
    ).toEqual(['This address is already on the list']);
    expect(list([{ label: '', cidr: '203.0.113.0/24' }]).success).toBe(false);
    expect(
      list(
        Array.from({ length: 21 }, (_, index) => ({
          label: `Office ${index}`,
          cidr: `192.0.2.${index}`,
        })),
      ).success,
    ).toBe(false);
  });

  it('asks a reason for a passkey reset (docs/schema-m9-passkeys.md P5)', () => {
    expect(resetPasskeysSchema.safeParse({ reason: '  ' }).success).toBe(false);
    expect(resetPasskeysSchema.parse({ reason: ' Phone stolen ' })).toEqual({
      reason: 'Phone stolen',
    });
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

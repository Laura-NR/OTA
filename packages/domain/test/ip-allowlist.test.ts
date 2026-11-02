import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OPERATING_THRESHOLDS,
  UserRole,
  changedThresholds,
  ipInRanges,
  ipRangeIssue,
  parseIpRange,
  superAdminIpAllowlistEnforced,
  superAdminIpRefused,
  thresholdsIssues,
  type IpAllowlistEntry,
} from '../src';

const OFFICES: IpAllowlistEntry[] = [
  { label: 'Havana office', cidr: '203.0.113.0/24' },
  { label: 'VPN', cidr: '2001:db8:4::/48' },
];

describe('reading addresses and ranges (docs/schema-m9-ip-allowlist.md I2)', () => {
  it('reads IPv4 and IPv6 addresses and ranges', () => {
    expect(parseIpRange('203.0.113.9')).toMatchObject({ prefix: 32 });
    expect(parseIpRange(' 203.0.113.0/24 ')).toMatchObject({ prefix: 24 });
    expect(parseIpRange('2001:db8::/32')).toMatchObject({ prefix: 32 });
    expect(parseIpRange('::')).toMatchObject({ prefix: 128 });
    expect(parseIpRange('0.0.0.0/0')).toMatchObject({ prefix: 0 });
  });

  it('refuses what is not an address or a range, rather than guess', () => {
    for (const value of [
      '',
      'office',
      '203.0.113',
      '203.0.113.256',
      '203.0.113.09',
      '203.0.113.0/33',
      '203.0.113.0/',
      '203.0.113.0/2a',
      '2001:db8::/129',
      '1::2::3',
      '1:2:3:4:5:6:7:8:9',
      '1:2:3:4:5:6:7:8::',
      ':1',
      'fe80::1%eth0',
      '192.0.2.1::',
      '::ffff:192.0.2.0/64',
    ]) {
      expect(parseIpRange(value), value).toBeNull();
    }
  });

  it('reads an IPv4 address written as IPv6 as the IPv4 one', () => {
    expect(ipInRanges('::ffff:203.0.113.9', ['203.0.113.0/24'])).toBe(true);
    expect(ipInRanges('203.0.113.9', ['::ffff:203.0.113.0/120'])).toBe(true);
    expect(ipInRanges('::ffff:127.0.0.1', ['127.0.0.1'])).toBe(true);
  });

  it('accepts IPv6 entries only as wide as Better Auth keeps an address (/64)', () => {
    expect(ipRangeIssue('2001:db8:4::/48')).toBeNull();
    expect(ipRangeIssue('2001:db8:4:1::/64')).toBeNull();
    expect(ipRangeIssue('2001:db8:4:1::/65')).toBe('IPV6_TOO_NARROW');
    expect(ipRangeIssue('2001:db8::1')).toBe('IPV6_TOO_NARROW');
    expect(ipRangeIssue('203.0.113.9')).toBeNull();
    expect(ipRangeIssue('Havana')).toBe('INVALID');
  });
});

describe('matching an address to the list', () => {
  it('matches inside a range up to its edges, and nothing outside', () => {
    const ranges = ['203.0.113.0/24'];
    expect(ipInRanges('203.0.113.0', ranges)).toBe(true);
    expect(ipInRanges('203.0.113.255', ranges)).toBe(true);
    expect(ipInRanges('203.0.112.255', ranges)).toBe(false);
    expect(ipInRanges('203.0.114.0', ranges)).toBe(false);
  });

  it('honours a prefix that is not a whole byte', () => {
    const ranges = ['198.51.100.64/26'];
    expect(ipInRanges('198.51.100.64', ranges)).toBe(true);
    expect(ipInRanges('198.51.100.127', ranges)).toBe(true);
    expect(ipInRanges('198.51.100.63', ranges)).toBe(false);
    expect(ipInRanges('198.51.100.128', ranges)).toBe(false);
  });

  it('reads a range written with host bits as its network', () => {
    expect(ipInRanges('203.0.113.200', ['203.0.113.9/24'])).toBe(true);
  });

  it('matches a single address exactly', () => {
    expect(ipInRanges('192.0.2.7', ['192.0.2.7'])).toBe(true);
    expect(ipInRanges('192.0.2.8', ['192.0.2.7'])).toBe(false);
  });

  it('matches an IPv6 address as Better Auth stores it (cut to /64)', () => {
    expect(
      ipInRanges(
        '2001:0db8:0004:0001:0000:0000:0000:0000',
        OFFICES.map((e) => e.cidr),
      ),
    ).toBe(true);
    expect(ipInRanges('2001:db8:5::', ['2001:db8:4::/48'])).toBe(false);
  });

  it('never matches across families, an unreadable address or a broken entry', () => {
    expect(ipInRanges('203.0.113.9', ['2001:db8::/32'])).toBe(false);
    expect(ipInRanges('2001:db8::1', ['0.0.0.0/0'])).toBe(false);
    expect(ipInRanges(null, ['0.0.0.0/0'])).toBe(false);
    expect(ipInRanges('unknown', ['0.0.0.0/0'])).toBe(false);
    expect(ipInRanges('203.0.113.9', ['not a range'])).toBe(false);
    expect(ipInRanges('203.0.113.9', [])).toBe(false);
  });
});

describe('who the rule refuses (I1, I4, I6)', () => {
  const superAdmin = { role: UserRole.SuperAdmin, enforced: true, entries: OFFICES };

  it('refuses a Super Admin who signed in from outside the list', () => {
    expect(superAdminIpRefused({ ...superAdmin, address: '198.51.100.7' })).toBe(true);
    expect(superAdminIpRefused({ ...superAdmin, address: '203.0.113.9' })).toBe(false);
  });

  it('refuses a Super Admin whose sign-in address is unknown', () => {
    expect(superAdminIpRefused({ ...superAdmin, address: null })).toBe(true);
  });

  it('never touches another role, even from outside the list', () => {
    for (const role of [
      UserRole.OperationsAdmin,
      UserRole.AdministrativeSupport,
      UserRole.Traveler,
      UserRole.ServiceWorker,
    ]) {
      expect(superAdminIpRefused({ ...superAdmin, role, address: '198.51.100.7' })).toBe(
        false,
      );
    }
  });

  it('refuses nobody while the rule is not in force', () => {
    expect(
      superAdminIpRefused({ ...superAdmin, enforced: false, address: '198.51.100.7' }),
    ).toBe(false);
  });

  it('is in force only while switched on and not suspended by the break-glass', () => {
    expect(superAdminIpAllowlistEnforced(true, undefined)).toBe(true);
    expect(superAdminIpAllowlistEnforced(true, 'on')).toBe(true);
    expect(superAdminIpAllowlistEnforced(true, ' OFF ')).toBe(false);
    expect(superAdminIpAllowlistEnforced(false, undefined)).toBe(false);
  });
});

describe('the allowlist in the thresholds document (I5, I7)', () => {
  it('is off with an empty list by default', () => {
    expect(DEFAULT_OPERATING_THRESHOLDS.superAdminIpAllowlistOn).toBe(false);
    expect(DEFAULT_OPERATING_THRESHOLDS.superAdminIpAllowlist).toEqual([]);
  });

  it('cannot be switched on with an empty list', () => {
    const next = { ...DEFAULT_OPERATING_THRESHOLDS, superAdminIpAllowlistOn: true };
    expect(thresholdsIssues(next, DEFAULT_OPERATING_THRESHOLDS)).toContain(
      'IP_ALLOWLIST_EMPTY',
    );
    expect(
      thresholdsIssues(
        { ...next, superAdminIpAllowlist: OFFICES },
        DEFAULT_OPERATING_THRESHOLDS,
      ),
    ).toEqual([]);
  });

  it('shows a changed list as one change, and the same list as none', () => {
    const before = { ...DEFAULT_OPERATING_THRESHOLDS, superAdminIpAllowlist: OFFICES };
    expect(
      changedThresholds(before, {
        ...before,
        superAdminIpAllowlist: OFFICES.map((entry) => ({
          cidr: entry.cidr,
          label: entry.label,
        })),
      }),
    ).toEqual([]);
    expect(
      changedThresholds(before, {
        ...before,
        superAdminIpAllowlist: [
          ...OFFICES,
          { label: 'Spain office', cidr: '192.0.2.0/24' },
        ],
      }),
    ).toEqual(['superAdminIpAllowlist']);
    expect(
      changedThresholds(before, {
        ...before,
        superAdminIpAllowlist: [{ ...OFFICES[0]!, label: 'Old Havana' }, OFFICES[1]!],
      }),
    ).toEqual(['superAdminIpAllowlist']);
  });
});

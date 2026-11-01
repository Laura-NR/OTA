import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OPERATING_THRESHOLDS,
  OVERRIDE_EXPIRY_HOURS,
  PERMISSION_CAPABILITIES,
  PERMISSION_MATRIX,
  UserRole,
  isOpenOverride,
  overridableCapabilities,
  overrideDecisionRefusal,
  overrideExpiresAt,
  overrideRequestRefusal,
  overrideStatus,
  roleAccess,
} from '../src';

const HOUR = 60 * 60 * 1000;
const requestedAt = new Date('2026-11-02T09:00:00Z');
const at = (hours: number) => new Date(requestedAt.getTime() + hours * HOUR);

describe('the permission matrix (docs/schema-m9-permission-overrides.md O1)', () => {
  it('has one row per capability, in the listed order', () => {
    expect(PERMISSION_MATRIX.map((row) => row.key)).toEqual([...PERMISSION_CAPABILITIES]);
  });

  it('gives a Super Admin every row', () => {
    for (const capability of PERMISSION_CAPABILITIES) {
      expect(roleAccess(UserRole.SuperAdmin, capability)).toBe('yes');
    }
  });

  it('gives travelers, workers and unknown roles nothing', () => {
    expect(roleAccess(UserRole.Traveler, 'bookings')).toBe('no');
    expect(roleAccess(UserRole.ServiceWorker, 'messages')).toBe('no');
    expect(roleAccess(null, 'reports')).toBe('no');
  });
});

describe('which rows a role may ask to override (O2)', () => {
  it('lets support ask for the eight rows it can only view', () => {
    expect(overridableCapabilities(UserRole.AdministrativeSupport)).toEqual([
      'bookings',
      'dispatch',
      'suppliers',
      'advisories',
      'disruptions',
      'payments',
      'catalog',
      'customers',
    ]);
  });

  it('never offers a Super Admin row, so an Operations Admin has nothing to ask for', () => {
    expect(overridableCapabilities(UserRole.OperationsAdmin)).toEqual([]);
    expect(overrideRequestRefusal(UserRole.OperationsAdmin, 'thresholds')).toBe(
      'NOT_OVERRIDABLE',
    );
    expect(overrideRequestRefusal(UserRole.AdministrativeSupport, 'thresholds')).toBe(
      'NOT_OVERRIDABLE',
    );
    expect(overrideRequestRefusal(UserRole.AdministrativeSupport, 'staff')).toBe(
      'NOT_OVERRIDABLE',
    );
    expect(overrideRequestRefusal(UserRole.AdministrativeSupport, 'ofacExport')).toBe(
      'NOT_OVERRIDABLE',
    );
  });

  it('refuses a row the role already holds, and anyone outside the staff', () => {
    expect(overrideRequestRefusal(UserRole.AdministrativeSupport, 'messages')).toBe(
      'ALREADY_HELD',
    );
    expect(overrideRequestRefusal(UserRole.SuperAdmin, 'payments')).toBe('ALREADY_HELD');
    expect(overrideRequestRefusal(UserRole.Traveler, 'payments')).toBe('NOT_STAFF');
  });

  it('accepts support asking for payments', () => {
    expect(overrideRequestRefusal(UserRole.AdministrativeSupport, 'payments')).toBeNull();
  });
});

describe("an override's status from its row and the clock (O4, O5)", () => {
  it('keeps a request pending for 24 hours, then lets it lapse', () => {
    const request = { state: 'REQUESTED' as const, requestedAt, expiresAt: null };
    expect(overrideStatus(request, at(23.9))).toBe('REQUESTED');
    expect(overrideStatus(request, at(24))).toBe('LAPSED');
  });

  it('runs an approved override until its end, then reads it as expired', () => {
    const approved = {
      state: 'APPROVED' as const,
      requestedAt,
      expiresAt: overrideExpiresAt(at(1), 24),
    };
    expect(approved.expiresAt).toEqual(at(25));
    expect(overrideStatus(approved, at(24.9))).toBe('ACTIVE');
    expect(overrideStatus(approved, at(25))).toBe('EXPIRED');
  });

  it('keeps declined and ended overrides as stored', () => {
    expect(overrideStatus({ state: 'DECLINED', requestedAt, expiresAt: null }, at(1))).toBe(
      'DECLINED',
    );
    expect(overrideStatus({ state: 'ENDED', requestedAt, expiresAt: at(30) }, at(2))).toBe(
      'ENDED',
    );
  });

  it('counts only a pending request or a running override as open', () => {
    expect(isOpenOverride('REQUESTED')).toBe(true);
    expect(isOpenOverride('ACTIVE')).toBe(true);
    for (const closed of ['LAPSED', 'EXPIRED', 'DECLINED', 'ENDED'] as const) {
      expect(isOpenOverride(closed)).toBe(false);
    }
  });

  it("defaults the expiry threshold to the board's 24 hours, which is also the longest", () => {
    expect(DEFAULT_OPERATING_THRESHOLDS.overrideExpiryHours).toBe(24);
    expect(OVERRIDE_EXPIRY_HOURS.max).toBe(24);
  });
});

describe('who decides an override (O4, O5)', () => {
  const holder = { id: 'support-1', role: UserRole.AdministrativeSupport };
  const superAdmin = { id: 'super-1', role: UserRole.SuperAdmin };
  const operations = { id: 'ops-1', role: UserRole.OperationsAdmin };
  const pending = { userId: holder.id, status: 'REQUESTED' as const };
  const active = { userId: holder.id, status: 'ACTIVE' as const };

  it('lets one Super Admin approve or decline a pending request', () => {
    expect(overrideDecisionRefusal(pending, superAdmin, 'APPROVE')).toBeNull();
    expect(overrideDecisionRefusal(pending, superAdmin, 'DECLINE')).toBeNull();
  });

  it('refuses approval from anyone else, and of anything not pending', () => {
    expect(overrideDecisionRefusal(pending, operations, 'APPROVE')).toBe('ROLE');
    expect(overrideDecisionRefusal(pending, holder, 'APPROVE')).toBe('ROLE');
    expect(overrideDecisionRefusal(active, superAdmin, 'APPROVE')).toBe('NOT_PENDING');
    expect(
      overrideDecisionRefusal({ userId: holder.id, status: 'LAPSED' }, superAdmin, 'DECLINE'),
    ).toBe('NOT_PENDING');
  });

  it('never lets a Super Admin approve a request of their own', () => {
    expect(
      overrideDecisionRefusal({ userId: superAdmin.id, status: 'REQUESTED' }, superAdmin, 'APPROVE'),
    ).toBe('OWN_REQUEST');
  });

  it('lets the holder or a Super Admin end a pending or running override', () => {
    expect(overrideDecisionRefusal(active, holder, 'END')).toBeNull();
    expect(overrideDecisionRefusal(pending, holder, 'END')).toBeNull();
    expect(overrideDecisionRefusal(active, superAdmin, 'END')).toBeNull();
    expect(overrideDecisionRefusal(active, operations, 'END')).toBe('ROLE');
    expect(
      overrideDecisionRefusal({ userId: holder.id, status: 'EXPIRED' }, holder, 'END'),
    ).toBe('NOT_OPEN');
  });
});

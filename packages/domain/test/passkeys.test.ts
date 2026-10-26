import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OPERATING_THRESHOLDS,
  UserRole,
  changedThresholds,
  passkeyChangeRefusal,
  passkeyRefusal,
  staffPasskeysEnforced,
} from '../src';

const STAFF = [
  UserRole.SuperAdmin,
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
];

describe('the staff passkey rule (docs/schema-m9-passkeys.md P1–P3)', () => {
  it('is off by default, and a switched rule is a change the approver sees', () => {
    expect(DEFAULT_OPERATING_THRESHOLDS.staffPasskeysRequired).toBe(false);
    expect(
      changedThresholds(DEFAULT_OPERATING_THRESHOLDS, {
        ...DEFAULT_OPERATING_THRESHOLDS,
        staffPasskeysRequired: true,
      }),
    ).toEqual(['staffPasskeysRequired']);
  });

  it('lets every session through while the rule is off', () => {
    for (const role of STAFF) {
      expect(
        passkeyRefusal({
          role,
          required: false,
          signInMethod: 'magic_link',
          passkeyCount: 0,
        }),
      ).toBeNull();
    }
  });

  it('never touches a traveler or a supplier, even with the rule on', () => {
    for (const role of [UserRole.Traveler, UserRole.ServiceWorker, null]) {
      expect(
        passkeyRefusal({
          role,
          required: true,
          signInMethod: 'magic_link',
          passkeyCount: 0,
        }),
      ).toBeNull();
    }
  });

  it('accepts a staff session that came from a passkey', () => {
    for (const role of STAFF) {
      expect(
        passkeyRefusal({
          role,
          required: true,
          signInMethod: 'passkey',
          passkeyCount: 1,
        }),
      ).toBeNull();
    }
  });

  it('limits a staff member with no passkey to setting one up', () => {
    expect(
      passkeyRefusal({
        role: UserRole.OperationsAdmin,
        required: true,
        signInMethod: 'magic_link',
        passkeyCount: 0,
      }),
    ).toBe('enroll');
  });

  it('sends an enrolled staff member who used a link back to their passkey', () => {
    expect(
      passkeyRefusal({
        role: UserRole.SuperAdmin,
        required: true,
        signInMethod: 'magic_link',
        passkeyCount: 2,
      }),
    ).toBe('use_passkey');
  });

  it('treats a session with no recorded method, or any other method, as not a passkey', () => {
    for (const signInMethod of [
      null,
      undefined,
      'password',
      'oauth',
      'other',
      'PASSKEY',
    ]) {
      expect(
        passkeyRefusal({
          role: UserRole.AdministrativeSupport,
          required: true,
          signInMethod,
          passkeyCount: 1,
        }),
      ).toBe('use_passkey');
    }
  });
});

describe('changing passkeys (P4)', () => {
  const staff = { role: UserRole.OperationsAdmin, required: true };

  it('lets a link session add the first passkey, and nothing more', () => {
    const fromLink = { ...staff, signInMethod: 'magic_link', passkeyCount: 0 };
    expect(passkeyChangeRefusal({ ...fromLink, change: 'register' })).toBeNull();
    const enrolled = { ...staff, signInMethod: 'magic_link', passkeyCount: 1 };
    expect(passkeyChangeRefusal({ ...enrolled, change: 'register' })).toBe(
      'PASSKEY_SESSION_REQUIRED',
    );
    expect(passkeyChangeRefusal({ ...enrolled, change: 'rename' })).toBe(
      'PASSKEY_SESSION_REQUIRED',
    );
    expect(passkeyChangeRefusal({ ...enrolled, change: 'delete' })).toBe(
      'PASSKEY_SESSION_REQUIRED',
    );
  });

  it('asks a passkey session even while the rule is off', () => {
    expect(
      passkeyChangeRefusal({
        role: UserRole.SuperAdmin,
        required: false,
        signInMethod: 'magic_link',
        passkeyCount: 1,
        change: 'delete',
      }),
    ).toBe('PASSKEY_SESSION_REQUIRED');
  });

  it('keeps the last passkey while the rule is on, but not after it is off', () => {
    const last = { ...staff, signInMethod: 'passkey', passkeyCount: 1 };
    expect(passkeyChangeRefusal({ ...last, change: 'delete' })).toBe('LAST_PASSKEY');
    expect(
      passkeyChangeRefusal({ ...last, required: false, change: 'delete' }),
    ).toBeNull();
    expect(
      passkeyChangeRefusal({ ...last, passkeyCount: 2, change: 'delete' }),
    ).toBeNull();
    expect(passkeyChangeRefusal({ ...last, change: 'register' })).toBeNull();
    expect(passkeyChangeRefusal({ ...last, change: 'rename' })).toBeNull();
  });

  it('does not limit a traveler', () => {
    expect(
      passkeyChangeRefusal({
        role: UserRole.Traveler,
        required: true,
        signInMethod: 'magic_link',
        passkeyCount: 1,
        change: 'delete',
      }),
    ).toBeNull();
  });
});

describe('the break-glass (P5)', () => {
  it('turns the rule off only when the deploy says off', () => {
    expect(staffPasskeysEnforced(true, undefined)).toBe(true);
    expect(staffPasskeysEnforced(true, '')).toBe(true);
    expect(staffPasskeysEnforced(true, 'on')).toBe(true);
    expect(staffPasskeysEnforced(true, 'off')).toBe(false);
    expect(staffPasskeysEnforced(true, ' OFF ')).toBe(false);
    expect(staffPasskeysEnforced(false, undefined)).toBe(false);
  });
});

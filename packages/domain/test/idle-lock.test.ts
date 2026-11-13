import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_REPORT_INTERVAL_MS,
  DEFAULT_OPERATING_THRESHOLDS,
  STAFF_IDLE_LOCK_MINUTES,
  UserRole,
  activityReportDue,
  changedThresholds,
  idleLockAt,
  isStaffSessionLocked,
  ownDeviceMayBeMarked,
} from '../src';

const MINUTE = 60 * 1000;
const SIGNED_IN = new Date('2026-10-31T09:00:00Z');
const at = (minutes: number) => new Date(SIGNED_IN.getTime() + minutes * MINUTE);

const STAFF = [
  UserRole.SuperAdmin,
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
];

function locked(
  overrides: Partial<Parameters<typeof isStaffSessionLocked>[0]> = {},
): boolean {
  return isStaffSessionLocked({
    role: UserRole.OperationsAdmin,
    ownDevice: false,
    lastActiveAt: null,
    signedInAt: SIGNED_IN,
    now: at(31),
    minutes: 30,
    ...overrides,
  });
}

describe('the desk idle lock (docs/schema-m9-idle-lock.md L1–L3)', () => {
  it('defaults to the board’s 30 minutes, a change the approver sees', () => {
    expect(STAFF_IDLE_LOCK_MINUTES).toBe(30);
    expect(DEFAULT_OPERATING_THRESHOLDS.staffIdleLockMinutes).toBe(30);
    expect(
      changedThresholds(DEFAULT_OPERATING_THRESHOLDS, {
        ...DEFAULT_OPERATING_THRESHOLDS,
        staffIdleLockMinutes: 15,
      }),
    ).toEqual(['staffIdleLockMinutes']);
  });

  it('locks every staff role once the limit has passed since the last input', () => {
    for (const role of STAFF) {
      expect(locked({ role, lastActiveAt: at(10), now: at(41) })).toBe(true);
      expect(locked({ role, lastActiveAt: at(10), now: at(40) })).toBe(false);
    }
  });

  it('counts from sign-in when the desk never reported input, so it fails closed', () => {
    expect(locked({ lastActiveAt: null, now: at(30) })).toBe(false);
    expect(locked({ lastActiveAt: null, now: at(31) })).toBe(true);
    expect(locked({ lastActiveAt: undefined, now: at(31) })).toBe(true);
  });

  it('never locks a session marked as the person’s own device', () => {
    expect(locked({ ownDevice: true, now: at(600) })).toBe(false);
  });

  it('never locks travelers or suppliers', () => {
    for (const role of [UserRole.Traveler, UserRole.ServiceWorker, null, undefined]) {
      expect(locked({ role, now: at(600) })).toBe(false);
    }
  });

  it('follows the applied limit', () => {
    expect(locked({ minutes: 5, now: at(6) })).toBe(true);
    expect(locked({ minutes: 240, now: at(200) })).toBe(false);
  });

  it('locks the desk’s tabs the limit after their latest input', () => {
    expect(idleLockAt(SIGNED_IN.getTime(), 30)).toBe(at(30).getTime());
  });
});

describe('the own-device choice is made at sign-in (L1)', () => {
  it('is accepted within ten minutes of sign-in, and refused after', () => {
    expect(ownDeviceMayBeMarked(SIGNED_IN, at(0))).toBe(true);
    expect(ownDeviceMayBeMarked(SIGNED_IN, at(10))).toBe(true);
    expect(ownDeviceMayBeMarked(SIGNED_IN, at(11))).toBe(false);
  });
});

describe('the desk reports input at most once a minute (L3)', () => {
  const now = SIGNED_IN.getTime();

  it('reports the first input at once', () => {
    expect(activityReportDue({ lastInputAt: now, lastReportedAt: null, now })).toBe(true);
  });

  it('reports nothing while there was no input', () => {
    expect(activityReportDue({ lastInputAt: null, lastReportedAt: null, now })).toBe(
      false,
    );
    expect(
      activityReportDue({
        lastInputAt: now - 2 * MINUTE,
        lastReportedAt: now - MINUTE,
        now,
      }),
    ).toBe(false);
  });

  it('waits a minute after the last report before reporting new input', () => {
    const lastReportedAt = now - ACTIVITY_REPORT_INTERVAL_MS + 1;
    expect(activityReportDue({ lastInputAt: now, lastReportedAt, now })).toBe(false);
    expect(
      activityReportDue({ lastInputAt: now, lastReportedAt: lastReportedAt - 1, now }),
    ).toBe(true);
  });
});

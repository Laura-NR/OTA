import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OPERATING_THRESHOLDS,
  KNOWN_DEVICE_STALE_DAYS,
  UserRole,
  changedThresholds,
  deviceLabel,
  knownDeviceCutoff,
  newDeviceEmailDue,
  recordsSignInDevice,
} from '../src';

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  headlessChrome:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36',
};

describe('a device label (docs/schema-m9-new-device-email.md N1)', () => {
  it('names the browser and the system', () => {
    expect(deviceLabel(UA.chromeWindows)).toBe('Chrome · Windows');
    expect(deviceLabel(UA.firefoxLinux)).toBe('Firefox · Linux');
    expect(deviceLabel(UA.safariMac)).toBe('Safari · macOS');
    expect(deviceLabel(UA.chromeAndroid)).toBe('Chrome · Android');
  });

  it('is not fooled by browsers that also say Chrome or Mac OS X', () => {
    expect(deviceLabel(UA.edgeWindows)).toBe('Edge · Windows');
    expect(deviceLabel(UA.safariIphone)).toBe('Safari · iOS');
    expect(deviceLabel(UA.headlessChrome)).toBe('Chrome · Linux');
  });

  it('keeps what it recognises and reads nothing as a dash', () => {
    expect(deviceLabel('curl/8.5.0')).toBe('—');
    expect(deviceLabel('SomeBot (Windows)')).toBe('Windows');
    expect(deviceLabel(null)).toBe('—');
    expect(deviceLabel('')).toBe('—');
  });
});

describe('a known device (N2)', () => {
  it('is forgotten after 180 days unseen', () => {
    const now = new Date('2026-11-01T12:00:00Z');
    expect(KNOWN_DEVICE_STALE_DAYS).toBe(180);
    expect(knownDeviceCutoff(now).toISOString()).toBe('2026-05-05T12:00:00.000Z');
  });
});

describe('the new-device email (N3–N5)', () => {
  it('goes to staff on a device not on file, the first one included', () => {
    for (const role of [
      UserRole.SuperAdmin,
      UserRole.OperationsAdmin,
      UserRole.AdministrativeSupport,
    ]) {
      expect(newDeviceEmailDue({ role, known: false, enabled: true })).toBe(true);
    }
  });

  it('is not sent for a known device', () => {
    expect(
      newDeviceEmailDue({ role: UserRole.SuperAdmin, known: true, enabled: true }),
    ).toBe(false);
  });

  it('is not sent while the switch is off', () => {
    expect(
      newDeviceEmailDue({ role: UserRole.SuperAdmin, known: false, enabled: false }),
    ).toBe(false);
  });

  it('never covers travelers or suppliers, whose devices are not recorded', () => {
    for (const role of [UserRole.Traveler, UserRole.ServiceWorker, null]) {
      expect(recordsSignInDevice(role)).toBe(false);
      expect(newDeviceEmailDue({ role, known: false, enabled: true })).toBe(false);
    }
    expect(recordsSignInDevice(UserRole.OperationsAdmin)).toBe(true);
  });

  it('is on by default and changes like any other setting', () => {
    expect(DEFAULT_OPERATING_THRESHOLDS.staffNewDeviceEmail).toBe(true);
    expect(
      changedThresholds(DEFAULT_OPERATING_THRESHOLDS, {
        ...DEFAULT_OPERATING_THRESHOLDS,
        staffNewDeviceEmail: false,
      }),
    ).toEqual(['staffNewDeviceEmail']);
  });
});

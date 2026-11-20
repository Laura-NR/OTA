import { describe, expect, it } from 'vitest';

import {
  fitsOneSmsSegment,
  installedWorkerApp,
  splitVersionCode,
  workerAppApkFor,
  workerAppLinkSms,
  workerAppNativeModules,
  workerAppSnoozedUntil,
  workerAppUpdate,
  workerJobActive,
  workerJsUpdateCheckDue,
  workerJsUpdateRefusal,
  type JobStepTimes,
  type WorkerAppJob,
} from '../src';

const NOW = new Date('2026-11-15T19:00:00.000Z');
const HOUR = 60 * 60_000;
const NONE: JobStepTimes = {
  EN_ROUTE: null,
  ARRIVED: null,
  STARTED: null,
  FINISHED: null,
};

function job(startsInHours: number, steps: JobStepTimes | null = null): WorkerAppJob {
  const startsAt = new Date(NOW.getTime() + startsInHours * HOUR);
  return { startsAt, endsAt: new Date(startsAt.getTime() + 4 * HOUR), steps };
}

describe('the split APKs (docs/worker-app-distribution-plan.md U8)', () => {
  it('reads the release and the split back from an installed version code', () => {
    expect(splitVersionCode(7, 'arm64-v8a')).toBe(72);
    expect(splitVersionCode(7, 'armeabi-v7a')).toBe(71);
    expect(installedWorkerApp(72)).toEqual({ versionCode: 7, abi: 'arm64-v8a' });
    expect(installedWorkerApp(71)).toEqual({ versionCode: 7, abi: 'armeabi-v7a' });
  });

  it('treats a universal build as having no split', () => {
    expect(installedWorkerApp(70)).toEqual({ versionCode: 7, abi: null });
  });

  it('downloads the phone’s own split, else arm64', () => {
    const apks = [
      { abi: 'armeabi-v7a' as const, file: 'old.apk' },
      { abi: 'arm64-v8a' as const, file: 'new.apk' },
    ];
    expect(workerAppApkFor(apks, 'armeabi-v7a')?.file).toBe('old.apk');
    expect(workerAppApkFor(apks, 'arm64-v8a')?.file).toBe('new.apk');
    expect(workerAppApkFor(apks, null)?.file).toBe('new.apk');
    expect(workerAppApkFor([], null)).toBeNull();
  });
});

describe('a job under way holds every update (U3a)', () => {
  it('counts a step taken on a job not yet finished', () => {
    expect(workerJobActive([job(-30, { ...NONE, EN_ROUTE: NOW })], NOW)).toBe(true);
  });

  it('counts a job starting within two hours and not yet over', () => {
    expect(workerJobActive([job(2)], NOW)).toBe(true);
    expect(workerJobActive([job(-3)], NOW)).toBe(true);
  });

  it('ignores a later job, an ended one and a finished one', () => {
    expect(workerJobActive([job(2.5)], NOW)).toBe(false);
    expect(workerJobActive([job(-5)], NOW)).toBe(false);
    expect(
      workerJobActive([job(-1, { ...NONE, EN_ROUTE: NOW, FINISHED: NOW })], NOW),
    ).toBe(false);
  });
});

describe('the update prompt (U3a)', () => {
  const release = { versionCode: 5, minVersionCode: 3 };
  const base = { release, jobActive: false, snoozedUntil: null, now: NOW };

  it('asks nothing when the phone runs the release or there is none', () => {
    expect(workerAppUpdate({ ...base, installedVersionCode: 5 })).toBe('none');
    expect(workerAppUpdate({ ...base, installedVersionCode: 6 })).toBe('none');
    expect(workerAppUpdate({ ...base, release: null, installedVersionCode: 1 })).toBe(
      'none',
    );
  });

  it('requires an update below the minimum, but never during a job', () => {
    expect(workerAppUpdate({ ...base, installedVersionCode: 2 })).toBe('required');
    expect(workerAppUpdate({ ...base, installedVersionCode: 2, jobActive: true })).toBe(
      'after-job',
    );
  });

  it('offers a newer release, hidden while snoozed or during a job', () => {
    expect(workerAppUpdate({ ...base, installedVersionCode: 3 })).toBe('optional');
    expect(
      workerAppUpdate({
        ...base,
        installedVersionCode: 3,
        snoozedUntil: workerAppSnoozedUntil(NOW),
      }),
    ).toBe('none');
    expect(
      workerAppUpdate({
        ...base,
        installedVersionCode: 3,
        snoozedUntil: new Date(NOW.getTime() - 1),
      }),
    ).toBe('optional');
    expect(workerAppUpdate({ ...base, installedVersionCode: 3, jobActive: true })).toBe(
      'none',
    );
  });

  it('snoozes for a day', () => {
    expect(workerAppSnoozedUntil(NOW).getTime() - NOW.getTime()).toBe(24 * HOUR);
  });
});

describe('the JS update check (U5a)', () => {
  it('checks once a day, never during a job', () => {
    expect(workerJsUpdateCheckDue(null, false, NOW)).toBe(true);
    expect(workerJsUpdateCheckDue(new Date(NOW.getTime() - 23 * HOUR), false, NOW)).toBe(
      false,
    );
    expect(workerJsUpdateCheckDue(new Date(NOW.getTime() - 24 * HOUR), false, NOW)).toBe(
      true,
    );
    expect(workerJsUpdateCheckDue(null, true, NOW)).toBe(false);
  });
});

describe('a JS update ships only to the APK it was built for (U5a)', () => {
  const modules = workerAppNativeModules({
    react: '19.3.0',
    'react-native': '0.88.0',
    expo: '58.0.19',
    'expo-updates': '58.0.20',
    '@ota/domain': 'workspace:*',
    '@react-native/virtualized-lists': '0.88.0',
  });

  it('counts Expo’s and React Native’s modules, not the app’s own packages', () => {
    expect(Object.keys(modules)).toEqual([
      '@react-native/virtualized-lists',
      'expo',
      'expo-updates',
      'react-native',
    ]);
  });

  it('refuses without an APK, on another runtime or after a native change', () => {
    const apk = { runtimeVersion: '0.2.0', nativeModules: modules };
    expect(
      workerJsUpdateRefusal({
        apk: null,
        runtimeVersion: '0.2.0',
        nativeModules: modules,
      }),
    ).toBe('no-apk');
    expect(
      workerJsUpdateRefusal({ apk, runtimeVersion: '0.3.0', nativeModules: modules }),
    ).toBe('runtime-version');
    expect(
      workerJsUpdateRefusal({
        apk,
        runtimeVersion: '0.2.0',
        nativeModules: { ...modules, 'expo-updates': '58.0.21' },
      }),
    ).toBe('native-modules');
    expect(
      workerJsUpdateRefusal({
        apk,
        runtimeVersion: '0.2.0',
        nativeModules: { ...modules, 'expo-device': '58.0.5' },
      }),
    ).toBe('native-modules');
    expect(
      workerJsUpdateRefusal({ apk, runtimeVersion: '0.2.0', nativeModules: modules }),
    ).toBeNull();
  });
});

describe('the approval SMS (U6a)', () => {
  it('carries the link in one segment', () => {
    const body = workerAppLinkSms('https://app.veredaexpeditions.com');
    expect(body).toContain('https://app.veredaexpeditions.com');
    expect(fitsOneSmsSegment(body!)).toBe(true);
  });

  it('is not sent when the link does not fit', () => {
    expect(workerAppLinkSms(`https://example.com/${'a'.repeat(120)}`)).toBeNull();
  });
});

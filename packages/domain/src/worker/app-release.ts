/**
 * The worker app's releases outside the stores (ADR 0007;
 * `docs/worker-app-distribution-plan.md` U2–U8). Pure: the release tool writes
 * the release, the API serves it, and these rules say which split a phone
 * runs, when the app asks for a new APK or checks for a JS update, and when a
 * JS update may ship to an APK at all.
 */
import { fitsOneSmsSegment } from './sms';
import type { JobStepTimes } from './job';

/** The split APKs, arm64 first: the download page's default (ADR 0007). */
export const WORKER_APP_ABIS = ['arm64-v8a', 'armeabi-v7a'] as const;
export type WorkerAppAbi = (typeof WORKER_APP_ABIS)[number];

/**
 * Each split's version code is the release's code times ten plus this digit
 * (U8), so an installed APK tells the app both its release and its split.
 */
const ABI_DIGIT: Record<WorkerAppAbi, number> = { 'armeabi-v7a': 1, 'arm64-v8a': 2 };

/** The version code Android sees for one split of a release. */
export function splitVersionCode(versionCode: number, abi: WorkerAppAbi): number {
  return versionCode * 10 + ABI_DIGIT[abi];
}

/**
 * Reads an installed APK's version code back into the release and the split.
 * A code ending in another digit (a universal build) has no split.
 */
export function installedWorkerApp(androidVersionCode: number): {
  versionCode: number;
  abi: WorkerAppAbi | null;
} {
  const digit = androidVersionCode % 10;
  const abi = WORKER_APP_ABIS.find((candidate) => ABI_DIGIT[candidate] === digit) ?? null;
  return { versionCode: Math.floor(androidVersionCode / 10), abi };
}

/** The APK a phone downloads: its own split, else arm64. */
export function workerAppApkFor<T extends { abi: WorkerAppAbi }>(
  apks: readonly T[],
  abi: WorkerAppAbi | null,
): T | null {
  return (
    apks.find((apk) => apk.abi === abi) ??
    apks.find((apk) => apk.abi === 'arm64-v8a') ??
    apks[0] ??
    null
  );
}

/** How long before a job starts the app stops asking for updates (U3a). */
export const WORKER_APP_JOB_LEAD_HOURS = 2;

/** How long "Más tarde" hides an optional update (U3a). */
export const WORKER_APP_SNOOZE_HOURS = 24;

/** How often the app checks for a JS update (U5a). */
export const WORKER_APP_JS_CHECK_HOURS = 24;

const HOUR_MS = 60 * 60_000;

/** An accepted job as the update rule reads it. */
export interface WorkerAppJob {
  startsAt: Date;
  endsAt: Date;
  steps: JobStepTimes | null;
}

/**
 * Whether a job is under way (U3a): a step taken and the last one not, or
 * an unfinished job starting within the next two hours and not yet over. An
 * update never interrupts one.
 */
export function workerJobActive(jobs: readonly WorkerAppJob[], now: Date): boolean {
  return jobs.some((job) => {
    if (job.steps?.FINISHED) return false;
    if (job.steps && Object.values(job.steps).some(Boolean)) return true;
    return (
      job.startsAt.getTime() - now.getTime() <= WORKER_APP_JOB_LEAD_HOURS * HOUR_MS &&
      now.getTime() <= job.endsAt.getTime()
    );
  });
}

/**
 * What the app shows about a new APK (U3a):
 * - `required`: below the release's minimum, so offers wait behind the prompt;
 * - `after-job`: required, but a job is under way, so the prompt waits for it;
 * - `optional`: newer, offered with "Más tarde", hidden while snoozed or
 *   during a job;
 * - `none`.
 */
export type WorkerAppUpdate = 'none' | 'optional' | 'required' | 'after-job';

export function workerAppUpdate(input: {
  installedVersionCode: number;
  release: { versionCode: number; minVersionCode: number } | null;
  jobActive: boolean;
  snoozedUntil: Date | null;
  now: Date;
}): WorkerAppUpdate {
  const { installedVersionCode, release, jobActive, snoozedUntil, now } = input;
  if (!release || installedVersionCode >= release.versionCode) return 'none';
  if (installedVersionCode < release.minVersionCode) {
    return jobActive ? 'after-job' : 'required';
  }
  if (jobActive || (snoozedUntil && snoozedUntil.getTime() > now.getTime()))
    return 'none';
  return 'optional';
}

/** When "Más tarde" stops hiding an optional update. */
export function workerAppSnoozedUntil(now: Date): Date {
  return new Date(now.getTime() + WORKER_APP_SNOOZE_HOURS * HOUR_MS);
}

/**
 * Whether the app checks for a JS update now (U5a): once a day, never during
 * a job, since a downloaded update applies at the next cold start.
 */
export function workerJsUpdateCheckDue(
  lastCheckedAt: Date | null,
  jobActive: boolean,
  now: Date,
): boolean {
  if (jobActive) return false;
  return (
    !lastCheckedAt ||
    now.getTime() - lastCheckedAt.getTime() >= WORKER_APP_JS_CHECK_HOURS * HOUR_MS
  );
}

/**
 * The dependencies an APK carries in native code: Expo's and React Native's
 * modules. A conservative list: every `expo*` package counts, even one that
 * is JavaScript only.
 */
export function workerAppNativeModules(
  dependencies: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(dependencies)
      .filter(([name]) =>
        /^(expo(-.+)?|react-native(-.+)?|@react-native\/.+)$/.test(name),
      )
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/**
 * Why a JS update cannot ship to the published APK (U5a), or null when it
 * can: the runtime version differs, or a native module changed since that
 * APK was built, which would crash the phones that load it.
 */
export function workerJsUpdateRefusal(input: {
  apk: { runtimeVersion: string; nativeModules: Readonly<Record<string, string>> } | null;
  runtimeVersion: string;
  nativeModules: Readonly<Record<string, string>>;
}): 'no-apk' | 'runtime-version' | 'native-modules' | null {
  const { apk, runtimeVersion, nativeModules } = input;
  if (!apk) return 'no-apk';
  if (apk.runtimeVersion !== runtimeVersion) return 'runtime-version';
  const published = Object.entries(apk.nativeModules);
  const current = Object.entries(nativeModules);
  if (
    published.length !== current.length ||
    published.some(([name, version]) => nativeModules[name] !== version)
  ) {
    return 'native-modules';
  }
  return null;
}

/**
 * The SMS sent when a supplier is approved (U6a): the download link, in one
 * GSM-7 segment with no accents. Null when the link is too long to fit, in
 * which case the email carries it alone.
 */
export function workerAppLinkSms(url: string): string | null {
  const body = `Vereda: ya eres colaborador. Descarga la app de colaboradores en ${url}`;
  return fitsOneSmsSegment(body) ? body : null;
}

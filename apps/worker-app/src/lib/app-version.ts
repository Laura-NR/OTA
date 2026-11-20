import * as Application from 'expo-application';

/**
 * The installed APK's Android version code: the release's code × 10 plus the
 * split's ABI digit (`installedWorkerApp` in `@ota/domain`, U8).
 */
export function installedVersionCode(): number {
  return Number(Application.nativeBuildVersion ?? 0);
}

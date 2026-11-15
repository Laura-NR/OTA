import Constants from 'expo-constants';

/**
 * The web preview (screenshots and e2e only, never shipped to workers) has no
 * APK: it reads as a universal build of the configured release.
 */
export function installedVersionCode(): number {
  return Number(Constants.expoConfig?.android?.versionCode ?? 0) * 10;
}

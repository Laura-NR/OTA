import { settings } from './config';

/**
 * The web preview (screenshots and e2e only, never shipped to workers) has no
 * APK: it reads as a universal build of the configured release. Its config
 * has no `android` section, hence `extra.versionCode`.
 */
export function installedVersionCode(): number {
  return settings.versionCode * 10;
}

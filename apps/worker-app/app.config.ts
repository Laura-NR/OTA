import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { loadTenantConfig } from '@ota/config';
import { themePrimitives } from '@ota/theming';
import type { ExpoConfig } from 'expo/config';
import { withAppBuildGradle, type ConfigPlugin } from 'expo/config-plugins';

/**
 * The worker app's build settings (ADR 0007; `docs/worker-app-plan.md`).
 * Everything agency-specific comes from the tenant manifest through
 * `@ota/config`, read here at build time, so the app's own code never
 * imports `tenant/`. `WORKER_API_URL` is the API the app talks to.
 */
const tenantConfigPath =
  process.env.TENANT_CONFIG_PATH ??
  join(__dirname, '..', '..', 'tenant', 'agency.config.json');
const tenant = loadTenantConfig(tenantConfigPath);
const primitives = themePrimitives(tenant);
const apiUrl = process.env.WORKER_API_URL ?? 'http://localhost:3001';

/**
 * The release (`docs/worker-app-distribution-plan.md` U8): bump both with
 * every APK. Each split's Android version code is `versionCode` × 10 plus its
 * ABI digit (`withAbiSplits` below). The version is also the
 * expo-updates runtime, so a native change always comes with a new version.
 */
const version = '0.1.0';
const versionCode = 1;

/**
 * The public certificate JS updates are signed against (U5a), made with
 * `expo-updates codesigning:generate`; its private key never enters the repo.
 * Without it the APK accepts no update at all.
 */
const updatesCertificate =
  process.env.WORKER_APP_UPDATES_CERTIFICATE ??
  join(dirname(tenantConfigPath), 'assets', 'worker-app', 'certificate.pem');

/**
 * ADR 0007's split APKs (U8): one per ABI, arm64 and 32-bit ARM, each with
 * its own version code (`splitVersionCode` in `@ota/domain`), so an installed
 * APK tells the app which split to download next. AGP 9 has no
 * `applicationVariants`, hence `androidComponents`.
 */
const ABI_SPLITS = `
// U8 (docs/worker-app-distribution-plan.md): split APKs, version code × 10 + ABI digit.
android {
    splits {
        abi {
            enable true
            reset()
            include "armeabi-v7a", "arm64-v8a"
            universalApk false
        }
    }
}
def otaAbiDigits = ["armeabi-v7a": 1, "arm64-v8a": 2]
androidComponents {
    onVariants(selector().all()) { variant ->
        variant.outputs.each { output ->
            def abi = output.filters.find { it.filterType.name() == "ABI" }?.identifier
            if (otaAbiDigits[abi] != null) {
                output.versionCode.set(android.defaultConfig.versionCode * 10 + otaAbiDigits[abi])
            }
        }
    }
}
`;

const withAbiSplits: ConfigPlugin = (expoConfig) =>
  withAppBuildGradle(expoConfig, (gradle) => {
    if (!gradle.modResults.contents.includes('otaAbiDigits')) {
      gradle.modResults.contents += ABI_SPLITS;
    }
    return gradle;
  });

/** A stable Android application id from the tenant id (`com.<tenant>.worker`). */
const androidPackage = `com.${tenant.tenantId.replace(/[^a-z0-9]/gi, '').toLowerCase()}.worker`;

const config: ExpoConfig = {
  name: `${tenant.branding.agencyName} · Colaboradores`,
  slug: `${tenant.tenantId}-worker`,
  version,
  runtimeVersion: version,
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  platforms: ['android', 'web'],
  android: {
    package: androidPackage,
    versionCode,
    // U4a: hand a downloaded APK to Android's installer.
    permissions: ['android.permission.REQUEST_INSTALL_PACKAGES'],
  },
  // U5a: checked by the app itself once a day, applied at the next cold start.
  updates: existsSync(updatesCertificate)
    ? {
        enabled: true,
        url: `${apiUrl}/worker-app/updates/manifest`,
        checkAutomatically: 'NEVER',
        fallbackToCacheTimeout: 0,
        codeSigningCertificate: relative(__dirname, updatesCertificate),
        codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
      }
    : { enabled: false },
  plugins: [
    'expo-secure-store',
    'expo-sqlite',
    // W-Credentials: the camera for a document's photo (Android asks once).
    [
      'expo-image-picker',
      {
        cameraPermission: 'La app usa la cámara para fotografiar tus documentos.',
        photosPermission: false,
        microphonePermission: false,
      },
    ],
    // W-Job J7: the position for an emergency report, while the app is open only.
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'La app usa tu ubicación solo para avisar a la central en una emergencia.',
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
        motionUsagePermission: false,
      },
    ],
    'expo-updates',
  ],
  extra: {
    apiUrl,
    // The web preview's stand-in for the APK's own version code (`app-version.web.ts`).
    versionCode,
    agencyName: tenant.branding.agencyName,
    deskPhone: tenant.branding.supportPhone ?? tenant.emergencyContacts[0]?.phone ?? null,
    colors: {
      primary: primitives['color-primary-600'],
      primaryDark: primitives['color-primary-700'],
      primarySoft: primitives['color-primary-50'],
      ink: primitives['color-neutral-900'],
      inkSoft: primitives['color-neutral-600'],
      line: primitives['color-neutral-200'],
      page: primitives['color-neutral-50'],
      surface: primitives['color-neutral-0'],
      success: primitives['color-success-700'],
      successSoft: primitives['color-success-100'],
      warning: primitives['color-warning-700'],
      warningSoft: primitives['color-warning-100'],
      danger: primitives['color-timeout-600'],
    },
  },
};

export default withAbiSplits(config);

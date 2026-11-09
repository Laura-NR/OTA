import { join } from 'node:path';

import { loadTenantConfig } from '@ota/config';
import { themePrimitives } from '@ota/theming';
import type { ExpoConfig } from 'expo/config';

/**
 * The worker app's build settings (ADR 0007; `docs/worker-app-plan.md`).
 * Everything agency-specific comes from the tenant manifest through
 * `@ota/config`, read here at build time, so the app's own code never
 * imports `tenant/`. `WORKER_API_URL` is the API the app talks to.
 */
const tenant = loadTenantConfig(
  process.env.TENANT_CONFIG_PATH ??
    join(__dirname, '..', '..', 'tenant', 'agency.config.json'),
);
const primitives = themePrimitives(tenant);

/** A stable Android application id from the tenant id (`com.<tenant>.worker`). */
const androidPackage = `com.${tenant.tenantId.replace(/[^a-z0-9]/gi, '').toLowerCase()}.worker`;

const config: ExpoConfig = {
  name: `${tenant.branding.agencyName} · Colaboradores`,
  slug: `${tenant.tenantId}-worker`,
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  platforms: ['android', 'web'],
  android: { package: androidPackage },
  plugins: ['expo-secure-store', 'expo-sqlite'],
  extra: {
    apiUrl: process.env.WORKER_API_URL ?? 'http://localhost:3001',
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

export default config;

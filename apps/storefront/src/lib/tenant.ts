import { loadTenantConfig, loadTenantMessages } from '@ota/config';
import type { TenantConfig } from '@ota/config';
import { dirname, join } from 'node:path';

/**
 * Where the fork-specific tenant manifest lives. Overridable with
 * TENANT_CONFIG_PATH; the default is relative to the app's working directory
 * (apps/storefront → ../../tenant/agency.config.json). Core never imports
 * `tenant/` directly — this is the `packages/config` boundary.
 */
export function resolveTenantConfigPath(): string {
  return (
    process.env.TENANT_CONFIG_PATH ??
    join(process.cwd(), '..', '..', 'tenant', 'agency.config.json')
  );
}

export function getTenantConfig(): TenantConfig {
  return loadTenantConfig(resolveTenantConfigPath());
}

/**
 * The tenant's message file for a locale (`tenant/messages/<locale>.json`,
 * next to the manifest): core copy it overrides and its own page `content`.
 */
export function getTenantMessages(locale: string): Record<string, unknown> {
  return loadTenantMessages(
    join(dirname(resolveTenantConfigPath()), 'messages', `${locale}.json`),
  );
}

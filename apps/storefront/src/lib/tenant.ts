import { loadTenantConfig } from '@ota/config';
import type { TenantConfig } from '@ota/config';
import { join } from 'node:path';

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

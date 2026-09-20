import { join } from 'node:path';

/**
 * Where the fork-specific tenant manifest lives. Overridable with
 * TENANT_CONFIG_PATH; the default is relative to the API's working directory
 * (apps/api → ../../tenant/agency.config.json).
 */
export function resolveTenantConfigPath(): string {
  return (
    process.env.TENANT_CONFIG_PATH ??
    join(process.cwd(), '..', '..', 'tenant', 'agency.config.json')
  );
}

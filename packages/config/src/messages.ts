import { existsSync, readFileSync } from 'node:fs';

/**
 * Read a tenant's message overrides (`tenant/messages/<locale>.json`): copy that
 * replaces core strings, plus the agency's own page content under `content`.
 * A missing file means the tenant overrides nothing. Like the manifest, the
 * file is read through this package so core code never imports `tenant/`.
 */
export function loadTenantMessages(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    return {};
  }
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Tenant messages must be a JSON object: ${path}`);
  }
  return parsed as Record<string, unknown>;
}

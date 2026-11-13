import { featureFlagsSchema, type FeatureFlags } from '@ota/config';
import { cache } from 'react';

import { apiBaseUrl } from './api';
import { getTenantConfig } from './tenant';

/**
 * The feature flags in force (M9 D8b), read from the API once per request: an
 * applied settings version may have switched the manifest's. When the API
 * cannot be reached the manifest's flags stand in; the API still refuses
 * whatever a switched-off flag covers, so a stale page cannot act on it.
 */
export const getFeatures = cache(async (): Promise<FeatureFlags> => {
  try {
    const response = await fetch(`${apiBaseUrl()}/tenant/config`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (response.ok) {
      const body = (await response.json()) as { features?: unknown };
      const parsed = featureFlagsSchema.safeParse(body.features);
      if (parsed.success) return parsed.data;
    }
  } catch {
    // Unreachable API (a build, or the API restarting): the manifest's flags.
  }
  return getTenantConfig().features;
});

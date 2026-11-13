import {
  DEFAULT_OPERATING_THRESHOLDS,
  featureFlagsOf,
  featuresInForce,
  type FeatureFlagValues,
  type OperatingThresholds,
} from '@ota/domain';
import type { OperatingSettingsDto } from '@ota/schemas';

import { apiFetch } from './api';
import { getTenantConfig } from './tenant';

/**
 * The M9 thresholds in force, from the API. If the API cannot answer, the
 * code's defaults with the manifest's payment terms and feature flags, which
 * is what the API runs on until a version applies.
 */
export async function getOperatingSettings(): Promise<OperatingSettingsDto | null> {
  return apiFetch<OperatingSettingsDto>('/settings/operating').catch(() => null);
}

export async function getThresholds(): Promise<OperatingThresholds> {
  const settings = await getOperatingSettings();
  return settings ? settings.values : manifestThresholds();
}

/**
 * The feature flags in force: the thresholds' flags less what the deployment
 * holds off, such as the AI assistant in production on the mock (A4).
 */
export async function getFeaturesInForce(): Promise<FeatureFlagValues> {
  const settings = await getOperatingSettings();
  return settings
    ? featuresInForce(featureFlagsOf(settings.values), settings.heldOff)
    : featureFlagsOf(manifestThresholds());
}

function manifestThresholds(): OperatingThresholds {
  const { payments, features } = getTenantConfig();
  return {
    ...DEFAULT_OPERATING_THRESHOLDS,
    paymentWindowHours: payments.windowHours,
    refundSingleUpTo: payments.refundApproval.singleUpTo,
    refundDualUpTo: payments.refundApproval.dualUpTo,
    ...featureFlagsOf(features),
  };
}

import { DEFAULT_OPERATING_THRESHOLDS, type OperatingThresholds } from '@ota/domain';
import type { OperatingSettingsDto } from '@ota/schemas';

import { apiFetch } from './api';
import { getTenantConfig } from './tenant';

/**
 * The M9 thresholds in force, from the API. If the API cannot answer, the
 * code's defaults with the manifest's payment terms, which is what the API
 * runs on until a version applies.
 */
export async function getOperatingSettings(): Promise<OperatingSettingsDto | null> {
  return apiFetch<OperatingSettingsDto>('/settings/operating').catch(() => null);
}

export async function getThresholds(): Promise<OperatingThresholds> {
  const settings = await getOperatingSettings();
  if (settings) return settings.values;
  const { payments } = getTenantConfig();
  return {
    ...DEFAULT_OPERATING_THRESHOLDS,
    paymentWindowHours: payments.windowHours,
    refundSingleUpTo: payments.refundApproval.singleUpTo,
    refundDualUpTo: payments.refundApproval.dualUpTo,
  };
}

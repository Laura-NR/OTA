import type { TenantConfig } from '@ota/config';
import type { CancellationBand, DepositPolicy } from '@ota/domain';

/** The manifest's deposit plan for a package's policy key (M4 D2); null without one. */
export function depositPolicyFor(
  tenant: TenantConfig,
  key: string | null | undefined,
): DepositPolicy | null {
  return key ? (tenant.policies.deposit[key] ?? null) : null;
}

/** The manifest's cancellation bands for a package's policy key; null without one. */
export function cancellationBandsFor(
  tenant: TenantConfig,
  key: string | null | undefined,
): CancellationBand[] | null {
  return key ? (tenant.policies.cancellation[key]?.bands ?? null) : null;
}

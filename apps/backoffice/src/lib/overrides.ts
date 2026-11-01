import { roleAccess, type PermissionCapability } from '@ota/domain';
import type { MyOverridesDto, PermissionOverrideDto } from '@ota/schemas';
import { cache } from 'react';

import { apiFetch } from './api';

/** The signed-in person's overrides, read once per request; null if the API cannot answer. */
export const getMyOverrides = cache(async (): Promise<MyOverridesDto | null> =>
  apiFetch<MyOverridesDto>('/permission-overrides/mine').catch(() => null),
);

/** The person's newest override for a row, whatever its status. */
export function latestOverride(
  mine: MyOverridesDto | null,
  capability: PermissionCapability,
): PermissionOverrideDto | null {
  return mine?.overrides.find((item) => item.capability === capability) ?? null;
}

export interface DeskAccess {
  /** The page shows this row's actions: the role holds it, or an override runs. */
  canManage: boolean;
  /** The role itself holds the row, so approvals show too (O3: an override never approves). */
  byRole: boolean;
  /** The person's overrides when the role only views the row; null when it holds it. */
  overrides: MyOverridesDto | null;
}

/**
 * Whether the signed-in person may act on a permission-matrix row
 * (`docs/schema-m9-permission-overrides.md` O1): their role's own access, or a
 * running override. The API decides the same way; this only picks what the
 * page shows.
 */
export async function deskAccess(
  role: string | null | undefined,
  capability: PermissionCapability,
): Promise<DeskAccess> {
  const access = roleAccess(role, capability);
  if (access === 'yes') return { canManage: true, byRole: true, overrides: null };
  if (access === 'no') return { canManage: false, byRole: false, overrides: null };
  const overrides = await getMyOverrides();
  return {
    canManage: latestOverride(overrides, capability)?.status === 'ACTIVE',
    byRole: false,
    overrides,
  };
}

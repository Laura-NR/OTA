import { CUBA_PROVINCE_NAMES } from '@ota/domain';
import { dirname } from 'node:path';

import { loadTenantGeography } from '@ota/config';

import type { RegionGroup } from './advisories';
import { resolveTenantConfigPath } from './tenant';

const GROUPS: readonly RegionGroup['key'][] = ['west', 'centre', 'east', 'isle'];

/** The 16 provinces, west to east, for the advisory region picker. */
export function advisoryProvinces(): { code: string; name: string }[] {
  return Object.entries(CUBA_PROVINCE_NAMES).map(([code, name]) => ({ code, name }));
}

/**
 * The region shortcuts ("Oriente") from the tenant's `provinces.json`; none
 * when the tenant publishes no destination data.
 */
export function advisoryRegionGroups(): RegionGroup[] {
  const geography = loadTenantGeography(dirname(resolveTenantConfigPath()));
  if (!geography) {
    return [];
  }
  return GROUPS.map((key) => ({
    key,
    codes: geography.provinces
      .filter((province) => province.region === key)
      .map((province) => province.code),
  })).filter((group) => group.codes.length > 0);
}

/** "Pinar del Río · Matanzas", or null for the whole country. */
export function regionNames(regions: readonly string[]): string | null {
  return regions.length > 0
    ? regions.map((code) => CUBA_PROVINCE_NAMES[code] ?? code).join(' · ')
    : null;
}

import {
  loadTenantGeography,
  type DestinationData,
  type ProvinceData,
  type TenantGeography,
} from '@ota/config';
import type { DestinationCard, DestinationsContent, PackageDto } from '@ota/schemas';
import { dirname } from 'node:path';

import { CUBA_PROVINCES } from './cuba-provinces';
import { resolveTenantConfigPath } from './tenant';

/** The tenant's destination data, read next to its manifest (`tenant/provinces.json`). */
export function getGeography(): TenantGeography | null {
  return loadTenantGeography(dirname(resolveTenantConfigPath()));
}

/** A province code's name as the map file spells it ("La Habana"). */
export function provinceName(code: string): string {
  return CUBA_PROVINCES.find((province) => province.id === code)?.name ?? code;
}

/** A province code for a name ("La Habana" → CU03), as catalogue items and old URLs carry names. */
export function provinceCode(name: string): string | null {
  return CUBA_PROVINCES.find((province) => province.name === name)?.id ?? null;
}

export interface ProvinceView extends ProvinceData {
  name: string;
  summary: string | null;
}

export interface DestinationView extends DestinationData, Omit<DestinationCard, 'power'> {
  /** The content's backup-power words; `power` is the data's ok/caution state. */
  powerLabel: string;
  provinceName: string;
  themeLabel: string;
  /** Live, active packages among the ones the data names. */
  packageCount: number;
  /** The cheapest of them, with its currency; null when there are none. */
  fromPrice: { amount: number; currency: string } | null;
}

export function buildProvinceViews(
  geography: TenantGeography,
  content: DestinationsContent,
): ProvinceView[] {
  return geography.provinces.map((province) => ({
    ...province,
    name: provinceName(province.code),
    summary: content.provinces[province.code]?.summary ?? null,
  }));
}

/**
 * Destinations with their words and live trips. A destination the tenant has
 * not described is left out rather than shown nameless.
 */
export function buildDestinationViews(
  geography: TenantGeography,
  content: DestinationsContent,
  packages: readonly PackageDto[],
): DestinationView[] {
  return geography.destinations.flatMap((destination) => {
    const words = content.items[destination.slug];
    if (!words) {
      return [];
    }
    const { power: powerLabel, ...card } = words;
    const trips = packages.filter((pkg) => destination.packages.includes(pkg.slug));
    const cheapest = trips.reduce<PackageDto | null>(
      (best, pkg) =>
        !best || Number(pkg.basePrice) < Number(best.basePrice) ? pkg : best,
      null,
    );
    return [
      {
        ...destination,
        ...card,
        powerLabel,
        provinceName: provinceName(destination.province),
        themeLabel: content.themes[destination.theme] ?? destination.theme,
        packageCount: trips.length,
        fromPrice: cheapest
          ? { amount: Number(cheapest.basePrice), currency: cheapest.currency }
          : null,
      },
    ];
  });
}

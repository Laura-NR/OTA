import type { SupplierLastJobDto, SupplierPowerDto } from '@ota/schemas';

import { opsDayMonth } from './ops-format';

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * The register's Power column (M6 D1): "Solar", "Generator 6 h", "Fuel 40 L"
 * or "None". `t` reads the `backoffice.suppliers` catalog.
 */
export function powerLabel(power: SupplierPowerDto, t: Translate): string {
  switch (power.kind) {
    case 'GENERATOR':
      return power.hoursPerDay === null
        ? t('power.generator')
        : t('power.generatorHours', { hours: power.hoursPerDay });
    case 'FUEL':
      return t('power.fuel', { litres: power.litres ?? 0 });
    default:
      return t(`power.${power.kind}`);
  }
}

/**
 * The Last job column (M6 D3): "3 Oct · Transport · Pinar del Río". The
 * service item holds a province, not a route, so no route is shown.
 * `serviceType` reads the `status.serviceType` catalog.
 */
export function lastJobLabel(
  job: SupplierLastJobDto,
  locale: string,
  serviceType: Translate,
): string {
  return [opsDayMonth(job.startsAt, locale), serviceType(job.serviceType), job.province]
    .filter(Boolean)
    .join(' · ');
}

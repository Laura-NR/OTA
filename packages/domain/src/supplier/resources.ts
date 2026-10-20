import { addMonths } from '../retention/retention';
import {
  ReservationStatus,
  ServiceItemStatus,
  type ServiceType,
} from '../reservation/status';
import { SupplierCategory } from './compliance';

/**
 * M6 supplier operations (`docs/schema-m6-suppliers.md`). The register stores
 * one confirmed resources row per supplier; these rules derive what is never
 * written: the Power label and the backup-power filter (D1), staleness (D2),
 * the last job and the 12-month count (D3), and the order of the disruption
 * console's resources (D5).
 */

export const GENERATOR_ACCESS = ['NONE', 'OWN', 'SHARED'] as const;
export type GeneratorAccess = (typeof GENERATOR_ACCESS)[number];

export const RESOURCE_CHANNELS = ['PHONE', 'WHATSAPP', 'VISIT', 'WORKER_APP'] as const;
export type ResourceChannel = (typeof RESOURCE_CHANNELS)[number];

/** The channels the desk records; WORKER_APP is the worker's own declaration. */
export const DESK_RESOURCE_CHANNELS = ['PHONE', 'WHATSAPP', 'VISIT'] as const;

/** A confirmation older than this is stale, after the board's "self-declared weekly". */
export const RESOURCES_STALE_DAYS = 7;

/** The window of the inspector's "Jobs · 12 m". */
export const JOB_HISTORY_MONTHS = 12;

/** Service-item states that count as a job the supplier took. */
export const JOB_STATUSES: readonly ServiceItemStatus[] = [
  ServiceItemStatus.Accepted,
  ServiceItemStatus.Fulfilled,
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** The categories that carry resources: casas (power) and drivers (fuel). */
export function hasResourceFields(category: SupplierCategory): boolean {
  return (
    category === SupplierCategory.HomestayHost ||
    category === SupplierCategory.PrivateDriver
  );
}

/** The confirmed facts the Power label and the filter read. */
export interface PowerFacts {
  generator: GeneratorAccess | null;
  generatorHoursPerDay: number | null;
  solarBatteryKwh: number | null;
  fuelReserveLitres: number | null;
}

export const POWER_KINDS = [
  'SOLAR',
  'GENERATOR',
  'FUEL',
  'NONE',
  'UNCONFIRMED',
  'NOT_APPLICABLE',
] as const;
export type PowerKind = (typeof POWER_KINDS)[number];

/** The register's Power column: "Solar", "Generator 6 h", "Fuel 40 L", "None". */
export interface SupplierPower {
  kind: PowerKind;
  /** A generator's hours per day, when the host gave them. */
  hoursPerDay: number | null;
  /** A driver's fuel reserve. */
  litres: number | null;
}

function hasSolar(facts: PowerFacts): boolean {
  return (facts.solarBatteryKwh ?? 0) > 0;
}

function hasGenerator(facts: PowerFacts): boolean {
  return facts.generator === 'OWN' || facts.generator === 'SHARED';
}

/**
 * The Power label (D1). For a casa, solar with a battery wins, then a
 * generator with its hours, else None; for a driver, the fuel reserve. A
 * casa or driver with no row is unconfirmed; guides and translators have none.
 */
export function supplierPower(
  category: SupplierCategory,
  facts: PowerFacts | null,
): SupplierPower {
  const label = (
    kind: PowerKind,
    hoursPerDay: number | null = null,
    litres: number | null = null,
  ) => ({
    kind,
    hoursPerDay,
    litres,
  });
  if (!hasResourceFields(category)) return label('NOT_APPLICABLE');
  if (!facts) return label('UNCONFIRMED');
  if (category === SupplierCategory.PrivateDriver) {
    return facts.fuelReserveLitres === null
      ? label('NONE')
      : label('FUEL', null, facts.fuelReserveLitres);
  }
  if (hasSolar(facts)) return label('SOLAR');
  if (hasGenerator(facts)) return label('GENERATOR', facts.generatorHoursPerDay);
  return label('NONE');
}

/**
 * The register's "Backup power only" filter: a casa with solar or a
 * generator, or a driver with fuel in reserve. Staleness does not remove a
 * supplier; the register greys it instead.
 */
export function hasBackupPower(
  category: SupplierCategory,
  facts: PowerFacts | null,
): boolean {
  if (!facts) return false;
  if (category === SupplierCategory.HomestayHost) {
    return hasSolar(facts) || hasGenerator(facts);
  }
  if (category === SupplierCategory.PrivateDriver) {
    return (facts.fuelReserveLitres ?? 0) > 0;
  }
  return false;
}

/** Hours of power a casa can count on per day: solar is the whole day. */
export function backupHoursPerDay(facts: PowerFacts): number {
  if (hasSolar(facts)) return 24;
  if (hasGenerator(facts)) return facts.generatorHoursPerDay ?? 0;
  return 0;
}

/** True once a confirmation is older than seven days (D2). */
export function isResourcesStale(confirmedAt: Date, now: Date): boolean {
  return now.getTime() - confirmedAt.getTime() > RESOURCES_STALE_DAYS * DAY_MS;
}

/** A service item assigned to the supplier, as the job history reads it. */
export interface SupplierJob {
  startsAt: Date;
  status: ServiceItemStatus;
  reservationStatus: ReservationStatus;
  serviceType: ServiceType;
  province: string | null;
}

/** A job counts once it was accepted or done, has started, and was not cancelled (D3). */
export function isCountedJob(job: SupplierJob, now: Date): boolean {
  return (
    JOB_STATUSES.includes(job.status) &&
    job.reservationStatus !== ReservationStatus.Cancelled &&
    job.startsAt.getTime() <= now.getTime()
  );
}

/** The latest counted job, or null when the supplier has none. */
export function lastJob<T extends SupplierJob>(jobs: readonly T[], now: Date): T | null {
  let latest: T | null = null;
  for (const job of jobs) {
    if (!isCountedJob(job, now)) continue;
    if (!latest || job.startsAt.getTime() > latest.startsAt.getTime()) latest = job;
  }
  return latest;
}

/** Counted jobs that started within the last 12 months. */
export function jobsInWindow(
  jobs: readonly SupplierJob[],
  now: Date,
  months: number = JOB_HISTORY_MONTHS,
): number {
  const since = addMonths(now, -months).getTime();
  return jobs.filter((job) => isCountedJob(job, now) && job.startsAt.getTime() >= since)
    .length;
}

/** A console entry: its name, its confirmation and what it offers (hours or litres). */
export interface RankedResource {
  name: string;
  confirmedAt: Date;
  amount: number;
}

/**
 * The console's order (D5): fresh confirmations first, then the most hours of
 * power (casas) or litres (drivers), then by name.
 */
export function rankResources<T extends RankedResource>(
  resources: readonly T[],
  now: Date,
): T[] {
  return [...resources].sort((a, b) => {
    const stale =
      Number(isResourcesStale(a.confirmedAt, now)) -
      Number(isResourcesStale(b.confirmedAt, now));
    if (stale !== 0) return stale;
    if (a.amount !== b.amount) return b.amount - a.amount;
    return a.name.localeCompare(b.name);
  });
}

/** The fields a resources confirmation carries; omitted ones are stored as null. */
export interface ResourcesInput extends PowerFacts {
  generatorSchedule: string | null;
  generatorFuelDays: number | null;
  waterTankLitres: number | null;
  rooms: number | null;
  guestCapacity: number | null;
}

export type ResourcesIssue =
  | 'NO_RESOURCES_FOR_CATEGORY'
  | 'GENERATOR_REQUIRED'
  | 'GENERATOR_DETAILS_WITHOUT_GENERATOR'
  | 'FUEL_ON_CASA'
  | 'FUEL_REQUIRED'
  | 'CASA_FIELDS_ON_DRIVER';

const CASA_FIELDS = [
  'generator',
  'generatorHoursPerDay',
  'generatorSchedule',
  'generatorFuelDays',
  'solarBatteryKwh',
  'waterTankLitres',
  'rooms',
  'guestCapacity',
] as const satisfies readonly (keyof ResourcesInput)[];

/**
 * Why a confirmation does not fit the supplier's category, or null. Casa
 * fields belong to casas and the fuel reserve to drivers; a casa states its
 * generator (NONE included), and a casa with none gives no generator hours,
 * schedule or fuel days.
 */
export function resourcesIssue(
  category: SupplierCategory,
  input: ResourcesInput,
): ResourcesIssue | null {
  if (!hasResourceFields(category)) return 'NO_RESOURCES_FOR_CATEGORY';
  if (category === SupplierCategory.PrivateDriver) {
    if (CASA_FIELDS.some((field) => input[field] !== null))
      return 'CASA_FIELDS_ON_DRIVER';
    if (input.fuelReserveLitres === null) return 'FUEL_REQUIRED';
    return null;
  }
  if (input.fuelReserveLitres !== null) return 'FUEL_ON_CASA';
  if (input.generator === null) return 'GENERATOR_REQUIRED';
  if (
    input.generator === 'NONE' &&
    ((input.generatorHoursPerDay ?? 0) > 0 ||
      (input.generatorFuelDays ?? 0) > 0 ||
      (input.generatorSchedule ?? '') !== '')
  ) {
    return 'GENERATOR_DETAILS_WITHOUT_GENERATOR';
  }
  return null;
}

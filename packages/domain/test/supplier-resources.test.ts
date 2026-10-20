import { describe, expect, it } from 'vitest';

import {
  SupplierCategory,
  backupHoursPerDay,
  hasBackupPower,
  isResourcesStale,
  jobsInWindow,
  lastJob,
  rankResources,
  resourcesIssue,
  supplierPower,
  type PowerFacts,
  type ResourcesInput,
  type SupplierJob,
} from '../src';

const NOW = new Date('2026-10-20T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

const CASA = SupplierCategory.HomestayHost;
const DRIVER = SupplierCategory.PrivateDriver;
const GUIDE = SupplierCategory.TourGuide;

const facts = (overrides: Partial<PowerFacts> = {}): PowerFacts => ({
  generator: 'NONE',
  generatorHoursPerDay: null,
  solarBatteryKwh: null,
  fuelReserveLitres: null,
  ...overrides,
});

describe('supplierPower (the register Power column, D1)', () => {
  it('prefers solar with a battery over a generator', () => {
    expect(
      supplierPower(
        CASA,
        facts({ generator: 'OWN', generatorHoursPerDay: 6, solarBatteryKwh: 5 }),
      ).kind,
    ).toBe('SOLAR');
  });

  it('labels a generator with its hours', () => {
    expect(
      supplierPower(CASA, facts({ generator: 'SHARED', generatorHoursPerDay: 6 })),
    ).toEqual({
      kind: 'GENERATOR',
      hoursPerDay: 6,
      litres: null,
    });
  });

  it('treats a zero battery as no solar', () => {
    expect(supplierPower(CASA, facts({ solarBatteryKwh: 0 })).kind).toBe('NONE');
  });

  it('labels a driver by the fuel reserve', () => {
    expect(
      supplierPower(DRIVER, facts({ generator: null, fuelReserveLitres: 40 })),
    ).toEqual({
      kind: 'FUEL',
      hoursPerDay: null,
      litres: 40,
    });
  });

  it('says unconfirmed when a casa or driver has no row', () => {
    expect(supplierPower(CASA, null).kind).toBe('UNCONFIRMED');
    expect(supplierPower(DRIVER, null).kind).toBe('UNCONFIRMED');
  });

  it('does not apply to guides and translators', () => {
    expect(supplierPower(GUIDE, facts({ solarBatteryKwh: 5 })).kind).toBe(
      'NOT_APPLICABLE',
    );
  });
});

describe('hasBackupPower (the "Backup power only" filter)', () => {
  it('keeps casas with solar or a generator', () => {
    expect(hasBackupPower(CASA, facts({ solarBatteryKwh: 5 }))).toBe(true);
    expect(
      hasBackupPower(CASA, facts({ generator: 'OWN', generatorHoursPerDay: 0 })),
    ).toBe(true);
    expect(hasBackupPower(CASA, facts())).toBe(false);
  });

  it('keeps drivers with fuel in reserve, not an empty tank', () => {
    expect(hasBackupPower(DRIVER, facts({ fuelReserveLitres: 40 }))).toBe(true);
    expect(hasBackupPower(DRIVER, facts({ fuelReserveLitres: 0 }))).toBe(false);
  });

  it('drops suppliers that were never confirmed', () => {
    expect(hasBackupPower(CASA, null)).toBe(false);
  });
});

describe('backupHoursPerDay', () => {
  it('counts solar as the whole day and a generator by its hours', () => {
    expect(backupHoursPerDay(facts({ solarBatteryKwh: 5 }))).toBe(24);
    expect(backupHoursPerDay(facts({ generator: 'OWN', generatorHoursPerDay: 6 }))).toBe(
      6,
    );
    expect(backupHoursPerDay(facts())).toBe(0);
  });
});

describe('isResourcesStale (D2: seven days)', () => {
  it('stays fresh for seven days and turns stale after', () => {
    expect(isResourcesStale(daysAgo(7), NOW)).toBe(false);
    expect(isResourcesStale(new Date(daysAgo(7).getTime() - 1), NOW)).toBe(true);
  });
});

describe('lastJob and jobsInWindow (D3)', () => {
  const job = (overrides: Partial<SupplierJob>): SupplierJob => ({
    startsAt: daysAgo(10),
    status: 'ACCEPTED',
    reservationStatus: 'CONFIRMED',
    serviceType: 'TRANSPORTATION',
    province: 'Pinar del Río',
    ...overrides,
  });

  it('picks the latest accepted or fulfilled job that has started', () => {
    const jobs = [
      job({ startsAt: daysAgo(30), status: 'FULFILLED' }),
      job({ startsAt: daysAgo(3), province: 'La Habana' }),
      job({ startsAt: new Date(NOW.getTime() + DAY_MS) }),
    ];
    expect(lastJob(jobs, NOW)?.province).toBe('La Habana');
  });

  it('ignores declined, timed-out and offered items and cancelled bookings', () => {
    const jobs = [
      job({ status: 'DECLINED' }),
      job({ status: 'TIMEOUT' }),
      job({ status: 'OFFERED' }),
      job({ reservationStatus: 'CANCELLED' }),
    ];
    expect(lastJob(jobs, NOW)).toBeNull();
    expect(jobsInWindow(jobs, NOW)).toBe(0);
  });

  it('counts the jobs of the last 12 months only', () => {
    const jobs = [
      job({ startsAt: daysAgo(10) }),
      job({ startsAt: daysAgo(300) }),
      job({ startsAt: daysAgo(400) }),
    ];
    expect(jobsInWindow(jobs, NOW)).toBe(2);
  });
});

describe('rankResources (D5 console order)', () => {
  it('puts fresh confirmations first, then the most hours or litres, then the name', () => {
    const ranked = rankResources(
      [
        { name: 'Stale big', confirmedAt: daysAgo(9), amount: 24 },
        { name: 'Fresh small', confirmedAt: daysAgo(1), amount: 6 },
        { name: 'Fresh big', confirmedAt: daysAgo(2), amount: 24 },
        { name: 'Alpha small', confirmedAt: daysAgo(2), amount: 6 },
      ],
      NOW,
    );
    expect(ranked.map((entry) => entry.name)).toEqual([
      'Fresh big',
      'Alpha small',
      'Fresh small',
      'Stale big',
    ]);
  });
});

describe('resourcesIssue (validated per category)', () => {
  const input = (overrides: Partial<ResourcesInput> = {}): ResourcesInput => ({
    generator: null,
    generatorHoursPerDay: null,
    generatorSchedule: null,
    generatorFuelDays: null,
    solarBatteryKwh: null,
    waterTankLitres: null,
    rooms: null,
    guestCapacity: null,
    fuelReserveLitres: null,
    ...overrides,
  });

  it('accepts a casa with its generator and a driver with fuel', () => {
    expect(
      resourcesIssue(
        CASA,
        input({ generator: 'OWN', generatorHoursPerDay: 6, rooms: 3 }),
      ),
    ).toBeNull();
    expect(resourcesIssue(DRIVER, input({ fuelReserveLitres: 40 }))).toBeNull();
  });

  it('refuses guides and translators', () => {
    expect(resourcesIssue(GUIDE, input({ fuelReserveLitres: 40 }))).toBe(
      'NO_RESOURCES_FOR_CATEGORY',
    );
  });

  it('keeps each category to its own fields', () => {
    expect(resourcesIssue(DRIVER, input({ fuelReserveLitres: 40, rooms: 2 }))).toBe(
      'CASA_FIELDS_ON_DRIVER',
    );
    expect(
      resourcesIssue(CASA, input({ generator: 'NONE', fuelReserveLitres: 40 })),
    ).toBe('FUEL_ON_CASA');
  });

  it('needs the generator answer from a casa and the litres from a driver', () => {
    expect(resourcesIssue(CASA, input({ rooms: 2 }))).toBe('GENERATOR_REQUIRED');
    expect(resourcesIssue(DRIVER, input())).toBe('FUEL_REQUIRED');
  });

  it('refuses generator hours on a casa without a generator', () => {
    expect(
      resourcesIssue(CASA, input({ generator: 'NONE', generatorHoursPerDay: 6 })),
    ).toBe('GENERATOR_DETAILS_WITHOUT_GENERATOR');
    expect(
      resourcesIssue(CASA, input({ generator: 'NONE', generatorHoursPerDay: 0 })),
    ).toBeNull();
  });
});

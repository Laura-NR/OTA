import { describe, expect, it } from 'vitest';

import { confirmResourcesSchema, listSuppliersQuerySchema } from '../src';

describe('confirmResourcesSchema (M6 D1, D4)', () => {
  it('stores omitted fields as null so a confirmation replaces the whole row', () => {
    expect(confirmResourcesSchema.parse({ via: 'PHONE', fuelReserveLitres: 40 })).toEqual(
      {
        via: 'PHONE',
        generator: null,
        generatorHoursPerDay: null,
        generatorSchedule: null,
        generatorFuelDays: null,
        solarBatteryKwh: null,
        waterTankLitres: null,
        rooms: null,
        guestCapacity: null,
        fuelReserveLitres: 40,
      },
    );
  });

  it('keeps generator hours within a day and amounts non-negative', () => {
    expect(
      confirmResourcesSchema.safeParse({ via: 'PHONE', generatorHoursPerDay: 25 })
        .success,
    ).toBe(false);
    expect(
      confirmResourcesSchema.safeParse({ via: 'PHONE', fuelReserveLitres: -1 }).success,
    ).toBe(false);
    expect(confirmResourcesSchema.safeParse({ via: 'PHONE', rooms: 1.5 }).success).toBe(
      false,
    );
  });

  it('caps the schedule at 60 characters and turns a blank one into null', () => {
    expect(
      confirmResourcesSchema.safeParse({
        via: 'PHONE',
        generatorSchedule: 'x'.repeat(61),
      }).success,
    ).toBe(false);
    expect(
      confirmResourcesSchema.parse({ via: 'PHONE', generatorSchedule: '  ' })
        .generatorSchedule,
    ).toBeNull();
  });

  it('rounds the battery to the one decimal the column keeps', () => {
    expect(
      confirmResourcesSchema.parse({ via: 'PHONE', solarBatteryKwh: 5.26 })
        .solarBatteryKwh,
    ).toBe(5.3);
  });

  it('refuses the worker app channel on the desk route', () => {
    expect(confirmResourcesSchema.safeParse({ via: 'WORKER_APP' }).success).toBe(false);
  });
});

describe('listSuppliersQuerySchema backupPower', () => {
  it('reads 1 as the filter and 0 or absence as none', () => {
    expect(listSuppliersQuerySchema.parse({ backupPower: '1' }).backupPower).toBe(true);
    expect(listSuppliersQuerySchema.parse({ backupPower: '0' }).backupPower).toBe(false);
    expect(listSuppliersQuerySchema.parse({}).backupPower).toBeUndefined();
  });
});

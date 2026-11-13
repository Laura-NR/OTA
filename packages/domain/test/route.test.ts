import { describe, expect, it } from 'vitest';

import { CUBA_PROVINCE_NAMES, cubaProvinceName } from '../src/geography/provinces';
import {
  MAX_ROUTE_STOPS,
  nearestByRoad,
  roadHours,
  summarizeNetwork,
  summarizeRoute,
  toggleRouteStop,
} from '../src/geography/route';

const pinar = { id: 'CU01', kmFromHavana: -180, nights: 3, limited: false };
const havana = { id: 'CU03', kmFromHavana: 0, nights: 3, limited: false };
const trinidad = { id: 'CU07', kmFromHavana: 320, nights: 3, limited: false };
const baracoa = { id: 'CU14', kmFromHavana: 930, nights: 3, limited: true };

describe('route sketch', () => {
  it('turns kilometres into driving hours at the board speed', () => {
    expect(roadHours(180)).toBe(3.3);
    expect(roadHours(0)).toBe(0);
  });

  it('adds stops in sleeping order and removes one tapped twice', () => {
    let route = toggleRouteStop([], 'CU01');
    route = toggleRouteStop(route, 'CU03');
    expect(route).toEqual(['CU01', 'CU03']);
    expect(toggleRouteStop(route, 'CU01')).toEqual(['CU03']);
  });

  it('keeps a full route as it is rather than dropping a stop', () => {
    const full = Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => `S${index}`);
    expect(toggleRouteStop(full, 'NEW')).toEqual(full);
  });

  it('sums the road and the nights, leg by leg', () => {
    const summary = summarizeRoute([pinar, havana, trinidad]);
    expect(summary.legs.map((leg) => leg.km)).toEqual([180, 320]);
    expect(summary).toMatchObject({
      km: 500,
      nights: 9,
      needsFlight: false,
      hasLimited: false,
    });
  });

  it('flags a leg over 600 km and a stop in a limited province', () => {
    const summary = summarizeRoute([havana, baracoa]);
    expect(summary.legs[0]).toMatchObject({ km: 930, flight: true });
    expect(summary).toMatchObject({ needsFlight: true, hasLimited: true });
  });

  it('has no legs for a single stop or an empty route', () => {
    expect(summarizeRoute([havana])).toMatchObject({ legs: [], km: 0, nights: 3 });
    expect(summarizeRoute([])).toMatchObject({ legs: [], km: 0, nights: 0 });
  });
});

describe('network panel', () => {
  it('finds the closest province by road', () => {
    expect(nearestByRoad({ kmFromHavana: 50 }, [pinar, havana, trinidad])).toBe(havana);
    expect(nearestByRoad({ kmFromHavana: 50 }, [])).toBeNull();
  });

  it('totals the network and counts only active provinces as active', () => {
    const base = { casas: 0, hotels: 0, guides: 0, drivers: 0 };
    expect(
      summarizeNetwork([
        { ...base, network: 'active', casas: 11, guides: 4, drivers: 3 },
        { ...base, network: 'limited', hotels: 1, drivers: 1 },
        { ...base, network: 'none' },
      ]),
    ).toEqual({ active: 1, provinces: 3, casas: 11, hotels: 1, guides: 4, drivers: 4 });
  });
});

describe('cubaProvinceName', () => {
  it('names the sixteen provinces by code and passes anything else through', () => {
    expect(Object.keys(CUBA_PROVINCE_NAMES)).toHaveLength(16);
    expect(cubaProvinceName('CU03')).toBe('La Habana');
    expect(cubaProvinceName('CU07')).toBe('Sancti Spíritus');
    expect(cubaProvinceName('XX01')).toBe('XX01');
  });
});

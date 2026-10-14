import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadTenantGeography } from '../src/geography';

const havana = {
  code: 'CU03',
  region: 'west',
  network: 'active',
  casas: 14,
  advisoryLevel: 1,
  powerCuts: { min: 2, max: 4 },
  fuel: 'ok',
  kmFromHavana: 0,
  nights: 3,
  label: { x: 267.5, y: 21.1 },
};

const destination = {
  slug: 'havana',
  province: 'CU03',
  theme: 'culture',
  power: 'ok',
  point: { x: 262.2, y: 24.3 },
};

function tenantDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'ota-geography-'));
  for (const [name, value] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(value));
  }
  return dir;
}

const provincesFile = (provinces: unknown[], status = 'published') => ({
  status,
  updated: '2026-10-03',
  provinces,
});

describe('loadTenantGeography', () => {
  it('means no destinations when the tenant has no provinces file', () => {
    expect(loadTenantGeography(tenantDir({}))).toBeNull();
  });

  it('reads provinces and destinations with their defaults', () => {
    const geography = loadTenantGeography(
      tenantDir({
        'provinces.json': provincesFile([havana]),
        'destinations.json': { status: 'published', destinations: [destination] },
      }),
    );
    expect(geography?.status).toBe('published');
    expect(geography?.provinces[0]).toMatchObject({ hotels: 0, guides: 0, drivers: 0 });
    expect(geography?.destinations[0]).toMatchObject({ limited: false, packages: [] });
  });

  it('stays a placeholder while either file is one', () => {
    const geography = loadTenantGeography(
      tenantDir({
        'provinces.json': provincesFile([havana]),
        'destinations.json': { status: 'placeholder', destinations: [destination] },
      }),
    );
    expect(geography?.status).toBe('placeholder');
  });

  it('rejects a destination in a province the file does not list', () => {
    const dir = tenantDir({
      'provinces.json': provincesFile([havana]),
      'destinations.json': {
        status: 'published',
        destinations: [{ ...destination, province: 'CU01' }],
      },
    });
    expect(() => loadTenantGeography(dir)).toThrow(/CU01/);
  });

  it('rejects repeated codes, inverted power-cut ranges and points off the map', () => {
    expect(() =>
      loadTenantGeography(
        tenantDir({ 'provinces.json': provincesFile([havana, havana]) }),
      ),
    ).toThrow(/duplicate province CU03/);
    expect(() =>
      loadTenantGeography(
        tenantDir({
          'provinces.json': provincesFile([{ ...havana, powerCuts: { min: 6, max: 2 } }]),
        }),
      ),
    ).toThrow();
    expect(() =>
      loadTenantGeography(
        tenantDir({
          'provinces.json': provincesFile([{ ...havana, label: { x: 2000, y: 0 } }]),
        }),
      ),
    ).toThrow();
  });
});

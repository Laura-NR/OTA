import { describe, expect, it } from 'vitest';

import {
  durationBucket,
  matchesQuery,
  normalizeSearchText,
  packageProvinces,
  searchPackages,
  type SearchablePackage,
} from '../src/catalog/package-search';

function pkg(
  name: string,
  overrides: Partial<SearchablePackage> = {},
): SearchablePackage & { id: string } {
  return {
    id: name,
    name,
    description: null,
    province: null,
    durationDays: 7,
    basePrice: '1000.00',
    services: [],
    ...overrides,
  };
}

const vinales = pkg('Eco-Tourism in Viñales', {
  province: 'Pinar del Río',
  durationDays: 8,
  basePrice: '1290.00',
  services: [
    { itemName: 'Casa Yamilé', itemProvince: 'Pinar del Río' },
    { itemName: 'Las Terrazas eco-community', itemProvince: 'Artemisa' },
  ],
});
const trinidad = pkg('Trinidad Heritage Trail', {
  province: 'Sancti Spíritus',
  durationDays: 3,
  basePrice: '240.00',
  description: 'Colonial streets and a casa on the plaza.',
});
const havana = pkg('Havana Cultural Immersion', {
  province: 'La Habana',
  durationDays: 10,
  basePrice: '1050.00',
});

describe('package search', () => {
  it('ignores case and accents, so travelers can type without them', () => {
    expect(normalizeSearchText('  Viñales ')).toBe('vinales');
    expect(matchesQuery(vinales, 'VINALES')).toBe(true);
  });

  it('needs every word of the query, in any searchable field', () => {
    expect(matchesQuery(vinales, 'terrazas pinar')).toBe(true);
    expect(matchesQuery(trinidad, 'colonial plaza')).toBe(true);
    expect(matchesQuery(trinidad, 'colonial beach')).toBe(false);
    expect(matchesQuery(trinidad, '   ')).toBe(true);
  });

  it('lists the provinces a package visits once each, its own first', () => {
    expect(packageProvinces(vinales)).toEqual(['Pinar del Río', 'Artemisa']);
  });

  it('buckets trip lengths so a short trip is still filterable', () => {
    expect(durationBucket(1)).toBe('short');
    expect(durationBucket(5)).toBe('short');
    expect(durationBucket(6)).toBe('week');
    expect(durationBucket(30)).toBe('long');
    expect(durationBucket(0)).toBeNull();
  });

  it('keeps packages that visit any chosen province, including through a service', () => {
    const found = searchPackages([vinales, trinidad, havana], {
      provinces: ['Artemisa'],
    });
    expect(found.map((item) => item.id)).toEqual([vinales.id]);
  });

  it('combines duration and price bounds', () => {
    const found = searchPackages([vinales, trinidad, havana], {
      durations: ['week', 'long'],
      maxPrice: 1200,
    });
    expect(found.map((item) => item.id)).toEqual([havana.id]);
  });

  it('keeps only packages whose every stay claims backup power when asked', () => {
    const powered = { ...vinales, backupPower: true };
    expect(
      searchPackages([powered, trinidad, havana], { backupPower: true }).map(
        (item) => item.id,
      ),
    ).toEqual([vinales.id]);
    expect(searchPackages([powered, trinidad, havana])).toHaveLength(3);
  });

  it('sorts without touching the catalogue order it was given', () => {
    const catalogue = [vinales, trinidad, havana];
    expect(
      searchPackages(catalogue, { sort: 'price-asc' }).map((item) => item.id),
    ).toEqual([trinidad.id, havana.id, vinales.id]);
    expect(searchPackages(catalogue, { sort: 'duration-asc' })[0]!.id).toBe(trinidad.id);
    expect(searchPackages(catalogue, { sort: 'price-desc' })[0]!.id).toBe(vinales.id);
    expect(searchPackages(catalogue).map((item) => item.id)).toEqual(
      catalogue.map((item) => item.id),
    );
  });
});

import { describe, expect, it } from 'vitest';

import { advisoryWriteSchema, publicAdvisoryQuerySchema } from '../src';

const draft = {
  severity: 'CAUTION',
  regions: ['CU01', 'CU01'],
  effectiveFrom: '2026-10-06T15:00:00Z',
  expiresAt: '2026-10-20T00:00:00Z',
  source: 'Vereda drivers on the ground',
  sourceLocale: 'en',
  showOnSite: true,
  showOnPackages: true,
  notifyTravelers: true,
  translations: [
    {
      locale: 'en',
      headline: 'Fuel queues in Pinar del Río, 6 Oct.',
      body: 'Station queues of 2 h or more around Viñales.',
      cta: 'See current conditions',
    },
  ],
};

describe('advisory write schema', () => {
  it('accepts a draft and removes repeated regions', () => {
    const parsed = advisoryWriteSchema.parse(draft);
    expect(parsed.regions).toEqual(['CU01']);
    expect(parsed.expiresAt).toBeInstanceOf(Date);
  });

  it('requires an end date after the start', () => {
    const result = advisoryWriteSchema.safeParse({
      ...draft,
      expiresAt: draft.effectiveFrom,
    });
    expect(result.success).toBe(false);
    expect(
      advisoryWriteSchema.safeParse({ ...draft, expiresAt: undefined }).success,
    ).toBe(false);
  });

  it('requires the source locale’s text and one translation per locale', () => {
    expect(advisoryWriteSchema.safeParse({ ...draft, sourceLocale: 'es' }).success).toBe(
      false,
    );
    const twice = {
      ...draft,
      translations: [...draft.translations, ...draft.translations],
    };
    expect(advisoryWriteSchema.safeParse(twice).success).toBe(false);
  });

  it('refuses a region that is not a province code', () => {
    expect(
      advisoryWriteSchema.safeParse({ ...draft, regions: ['Oriente'] }).success,
    ).toBe(false);
    expect(publicAdvisoryQuerySchema.safeParse({ province: 'La Habana' }).success).toBe(
      false,
    );
  });
});

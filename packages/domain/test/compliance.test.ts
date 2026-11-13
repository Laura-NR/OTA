import { describe, expect, it } from 'vitest';

import {
  OFAC_CATEGORIES,
  affidavitRetainUntil,
  currentConsents,
  isUsPerson,
  needsConsent,
  ofacGate,
  signatureMatches,
  type ConsentEntry,
} from '../src';

describe('isUsPerson', () => {
  it('derives US-person status from the nationality unless the desk overrides it', () => {
    expect(isUsPerson({ usPerson: null, nationality: 'US' })).toBe(true);
    expect(isUsPerson({ usPerson: null, nationality: 'us' })).toBe(true);
    expect(isUsPerson({ usPerson: null, nationality: 'CA' })).toBe(false);
    expect(isUsPerson({ usPerson: null, nationality: null })).toBe(false);
    // A US resident on a Canadian passport, and the reverse correction.
    expect(isUsPerson({ usPerson: true, nationality: 'CA' })).toBe(true);
    expect(isUsPerson({ usPerson: false, nationality: 'US' })).toBe(false);
  });
});

describe('signatureMatches', () => {
  it('accepts the full name regardless of case, accents and spacing', () => {
    expect(signatureMatches('luis   ORTEGA', 'Luis Ortega')).toBe(true);
    expect(signatureMatches('José Martínez', 'Jose Martinez')).toBe(true);
    expect(signatureMatches(' Margaret Anne Chen ', 'Margaret Anne Chen')).toBe(true);
  });

  it('refuses another name, a partial name and an empty signature', () => {
    expect(signatureMatches('Luis', 'Luis Ortega')).toBe(false);
    expect(signatureMatches('David Chen', 'Margaret Chen')).toBe(false);
    expect(signatureMatches('   ', '   ')).toBe(false);
  });
});

describe('affidavitRetainUntil', () => {
  it('keeps the record five years after the trip ends', () => {
    expect(affidavitRetainUntil(new Date('2027-02-20T00:00:00Z')).toISOString()).toBe(
      '2032-02-20T00:00:00.000Z',
    );
    // A leap day falls back to the last day of February.
    expect(affidavitRetainUntil(new Date('2028-02-29T00:00:00Z')).toISOString()).toBe(
      '2033-02-28T00:00:00.000Z',
    );
  });
});

describe('ofacGate', () => {
  const travelers = [
    { id: 'margaret', usPerson: null, nationality: 'CA' },
    { id: 'luis', usPerson: null, nationality: 'US' },
    { id: 'ana', usPerson: true, nationality: 'MX' },
  ];

  it('requires every US person and lists those without an affidavit', () => {
    expect(ofacGate(travelers, [{ travelerId: 'luis' }])).toEqual({
      required: ['luis', 'ana'],
      missing: ['ana'],
    });
  });

  it('clears once every US person has certified, and is empty without US persons', () => {
    expect(
      ofacGate(travelers, [{ travelerId: 'luis' }, { travelerId: 'ana' }]).missing,
    ).toEqual([]);
    expect(ofacGate([travelers[0]!], [])).toEqual({ required: [], missing: [] });
  });

  it('names the twelve general-licence categories', () => {
    expect(OFAC_CATEGORIES).toHaveLength(12);
    expect(OFAC_CATEGORIES).toContain('SUPPORT_FOR_THE_CUBAN_PEOPLE');
  });
});

describe('consent log', () => {
  const entry = (
    purpose: ConsentEntry['purpose'],
    granted: boolean,
    textVersion: string,
    at: string,
  ): ConsentEntry => ({ purpose, granted, textVersion, createdAt: new Date(at) });

  it('takes the latest entry per purpose, so a withdrawal replaces a grant', () => {
    const current = currentConsents([
      entry('MARKETING_EMAIL', true, 'marketing@1', '2026-10-01T10:00:00Z'),
      entry('TERMS', true, 'terms@1', '2026-10-01T10:00:00Z'),
      entry('MARKETING_EMAIL', false, 'marketing@1', '2026-10-05T10:00:00Z'),
    ]);

    expect(current.get('MARKETING_EMAIL')?.granted).toBe(false);
    expect(current.get('TERMS')?.granted).toBe(true);
    expect(current.has('PRIVACY_NOTICE')).toBe(false);
  });

  it('asks again when the text version changed, nothing was given, or it was withdrawn', () => {
    const granted = entry('TERMS', true, 'terms@1', '2026-10-01T10:00:00Z');

    expect(needsConsent(granted, 'terms@1')).toBe(false);
    expect(needsConsent(granted, 'terms@2')).toBe(true);
    expect(needsConsent(undefined, 'terms@1')).toBe(true);
    expect(needsConsent({ ...granted, granted: false }, 'terms@1')).toBe(true);
  });
});

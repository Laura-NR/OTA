import { describe, expect, it } from 'vitest';

import {
  calculatePackagePrice,
  canPublishPackage,
  childRate,
  packagePublishIssues,
  type PackagePublishInput,
} from '../src';

const bands = [
  { maxAge: 2, rate: 0 },
  { maxAge: 11, rate: 0.5 },
];

describe('calculatePackagePrice', () => {
  it('prices adults at the base when there is no departure or tier delta', () => {
    const result = calculatePackagePrice({
      basePrice: 240,
      departurePrice: null,
      tierDelta: 0,
      singleSupplement: null,
      adults: 2,
      childAges: [],
      childBands: bands,
      extras: [],
      singleRooms: 0,
    });

    expect(result.perPerson).toBe(240);
    expect(result.adultsTotal).toBe(480);
    expect(result.total).toBe(480);
  });

  it('prefers the departure price and adds the tier delta', () => {
    const result = calculatePackagePrice({
      basePrice: 240,
      departurePrice: 265,
      tierDelta: 120,
      singleSupplement: null,
      adults: 1,
      childAges: [],
      childBands: bands,
      extras: [],
      singleRooms: 0,
    });

    expect(result.perPerson).toBe(385);
    expect(result.total).toBe(385);
  });

  it('applies child band rates and the single supplement', () => {
    const result = calculatePackagePrice({
      basePrice: 200,
      departurePrice: null,
      tierDelta: 0,
      singleSupplement: 60,
      adults: 2,
      childAges: [2, 9],
      childBands: bands,
      extras: [],
      singleRooms: 1,
    });

    // 2 adults @200 = 400; child 2 free, child 9 at half = 100; one single +60.
    expect(result.childrenTotal).toBe(100);
    expect(result.singlesTotal).toBe(60);
    expect(result.total).toBe(560);
  });

  it('prices extras per person and per booking', () => {
    const result = calculatePackagePrice({
      basePrice: 100,
      departurePrice: null,
      tierDelta: 0,
      singleSupplement: null,
      adults: 2,
      childAges: [8],
      childBands: bands,
      extras: [
        { price: 35, unit: 'PER_PERSON' },
        { price: 50, unit: 'PER_BOOKING', quantity: 2 },
      ],
      singleRooms: 0,
    });

    // 3 travelers: 35*3 = 105; 50*2 = 100.
    expect(result.extrasTotal).toBe(205);
    expect(result.total).toBe(455);
  });
});

describe('childRate', () => {
  it('takes the first matching band and falls back to the adult rate', () => {
    expect(childRate(1, bands)).toBe(0);
    expect(childRate(9, bands)).toBe(0.5);
    expect(childRate(14, bands)).toBe(1);
    expect(childRate(9, [])).toBe(1);
  });
});

function publishInput(overrides: Partial<PackagePublishInput> = {}): PackagePublishInput {
  return {
    name: 'Trinidad Heritage Trail',
    slug: 'trinidad-heritage-trail',
    serviceCount: 3,
    departureCount: 2,
    bookingModel: 'REQUEST',
    cancellationPolicy: 'standard',
    depositPolicy: 'deposit-20',
    media: [{ altText: 'A colonial street', showsPeople: false, consentReference: null }],
    knownPolicyKeys: ['standard', 'deposit-20'],
    ...overrides,
  };
}

describe('packagePublishIssues', () => {
  it('publishes a complete package', () => {
    expect(packagePublishIssues(publishInput())).toEqual([]);
    expect(canPublishPackage(publishInput())).toBe(true);
  });

  it('requires a name, slug, a service and a departure', () => {
    expect(
      packagePublishIssues(
        publishInput({ name: '  ', slug: '', serviceCount: 0, departureCount: 0 }),
      ),
    ).toEqual([
      'NAME_REQUIRED',
      'SLUG_REQUIRED',
      'SERVICE_REQUIRED',
      'DEPARTURE_REQUIRED',
    ]);
  });

  it('requires alt text and consent for photos that show people', () => {
    expect(
      packagePublishIssues(
        publishInput({
          media: [
            { altText: '', showsPeople: false, consentReference: null },
            { altText: 'Guests on a terrace', showsPeople: true, consentReference: null },
          ],
        }),
      ),
    ).toEqual(['MEDIA_ALT_REQUIRED', 'MEDIA_CONSENT_REQUIRED']);
  });

  it('refuses an unknown policy key', () => {
    expect(
      packagePublishIssues(publishInput({ cancellationPolicy: 'unknown-policy' })),
    ).toContain('UNKNOWN_POLICY');
  });

  it('locks INSTANT until allotments exist', () => {
    expect(packagePublishIssues(publishInput({ bookingModel: 'INSTANT' }))).toContain(
      'INSTANT_UNAVAILABLE',
    );
    expect(
      packagePublishIssues(
        publishInput({ bookingModel: 'INSTANT', instantAvailable: true }),
      ),
    ).toEqual([]);
  });
});

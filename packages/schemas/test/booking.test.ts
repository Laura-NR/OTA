import { describe, expect, it } from 'vitest';

import { bookPackageSchema } from '../src';

const PACKAGE = '0b8f3c2e-6a1d-4f5e-9c7b-2d4e6f8a0b1c';
const DEPARTURE = '1c9a4d3f-7b2e-4a6f-8d8c-3e5f7a9b1c2d';
const EXTRA = '2d0b5e4a-8c3f-4b7a-9e9d-4f6a8b0c2d3e';

const consents = [
  { purpose: 'TERMS', textVersion: 'booking-terms@2026-10-17' },
  { purpose: 'PRIVACY_NOTICE', textVersion: 'booking-terms@2026-10-17' },
  { purpose: 'CANCELLATION_POLICY', textVersion: 'booking-terms@2026-10-17' },
  { purpose: 'INSURANCE_ACKNOWLEDGEMENT', textVersion: 'insurance@2026-10-17' },
];

function booking(overrides: Record<string, unknown> = {}) {
  return {
    packageId: PACKAGE,
    departureId: DEPARTURE,
    rooming: 'SHARE',
    travelers: [
      {
        fullName: 'Margaret Anne Chen',
        dateOfBirth: '1980-04-02',
        nationality: 'us',
        passportNumber: 'ab 123-4567',
      },
    ],
    consents,
    ...overrides,
  };
}

describe('bookPackageSchema', () => {
  it('normalises the passport number and nationality, and defaults the choices', () => {
    const parsed = bookPackageSchema.parse(booking());

    expect(parsed.travelers[0]).toMatchObject({
      nationality: 'US',
      passportNumber: 'AB1234567',
    });
    expect(parsed).toMatchObject({ tierId: null, extras: [], affidavits: [] });
  });

  it('carries no traveler kind or price: the server derives both', () => {
    const parsed = bookPackageSchema.parse(
      booking({
        travelers: [
          {
            fullName: 'Margaret Anne Chen',
            dateOfBirth: '1980-04-02',
            nationality: 'US',
            kind: 'INFANT',
          },
        ],
        total: 1,
      }),
    );

    expect(parsed.travelers[0]).not.toHaveProperty('kind');
    expect(parsed).not.toHaveProperty('total');
  });

  it('refuses a booking without every required consent', () => {
    const result = bookPackageSchema.safeParse(
      booking({ consents: consents.filter((consent) => consent.purpose !== 'TERMS') }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      'The TERMS consent is required to send a booking',
    );
  });

  it('refuses a consent the booking does not ask for, and a duplicate extra', () => {
    const result = bookPackageSchema.safeParse(
      booking({
        consents: [...consents, { purpose: 'COOKIES_MARKETING', textVersion: 'v1' }],
        extras: [{ packageExtraId: EXTRA }, { packageExtraId: EXTRA }],
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'COOKIES_MARKETING is not asked for at booking',
        'An extra is listed twice',
      ]),
    );
  });

  it('ties each certification to a listed traveler and a statement version', () => {
    const result = bookPackageSchema.safeParse(
      booking({
        affidavits: [
          {
            traveler: 3,
            category: 'SUPPORT_FOR_THE_CUBAN_PEOPLE',
            signature: 'Margaret Anne Chen',
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'The certification is for a traveler who is not in the list',
        'A certification needs the statement version it was signed under',
      ]),
    );
  });

  it('refuses a date of birth in the future', () => {
    const result = bookPackageSchema.safeParse(
      booking({
        travelers: [{ fullName: 'Ana', dateOfBirth: '2999-01-01', nationality: 'ES' }],
      }),
    );

    expect(result.success).toBe(false);
  });
});

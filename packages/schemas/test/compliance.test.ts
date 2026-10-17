import { describe, expect, it } from 'vitest';

import {
  affidavitSummarySchema,
  legalContentSchema,
  recordConsentSchema,
  reservationOfacSchema,
  signAffidavitSchema,
} from '../src';

describe('affidavit DTOs', () => {
  it('keeps the signature, IP and user agent out of every list shape', () => {
    for (const shape of [
      Object.keys(affidavitSummarySchema.shape),
      Object.keys(
        reservationOfacSchema.shape.travelers.element.shape.affidavit.unwrap().shape,
      ),
    ]) {
      expect(shape).not.toContain('signature');
      expect(shape).not.toContain('ipAddress');
      expect(shape).not.toContain('userAgent');
    }
  });

  it('accepts only one of the twelve categories and a typed signature', () => {
    expect(
      signAffidavitSchema.parse({
        category: 'SUPPORT_FOR_THE_CUBAN_PEOPLE',
        signature: '  Luis Ortega ',
        statementVersion: 'ofac-statement@2026-10-17',
      }).signature,
    ).toBe('Luis Ortega');
    expect(() =>
      signAffidavitSchema.parse({
        category: 'TOURISM',
        signature: 'Luis Ortega',
        statementVersion: 'v1',
      }),
    ).toThrowError();
  });
});

describe('consent DTOs', () => {
  it('records the text version the traveler was shown, from the account by default', () => {
    expect(
      recordConsentSchema.parse({
        purpose: 'MARKETING_EMAIL',
        granted: true,
        textVersion: 'marketing@2026-10-17',
      }),
    ).toEqual({
      purpose: 'MARKETING_EMAIL',
      granted: true,
      textVersion: 'marketing@2026-10-17',
      source: 'ACCOUNT',
    });
    expect(() =>
      recordConsentSchema.parse({ purpose: 'MARKETING_EMAIL', granted: true }),
    ).toThrowError();
  });

  it('declares the legal texts per purpose and refuses an unknown purpose', () => {
    const legal = legalContentSchema.parse({
      status: 'placeholder',
      ofacStatement: { version: 'ofac@1', text: 'I certify…' },
      consents: { MARKETING_EMAIL: { version: 'marketing@1', text: 'Stories…' } },
    });
    expect(legal.consents.MARKETING_EMAIL?.version).toBe('marketing@1');
    expect(legalContentSchema.parse({ status: 'placeholder' }).consents).toEqual({});
    expect(() =>
      legalContentSchema.parse({
        status: 'placeholder',
        consents: { NEWSLETTER: { version: 'x', text: 'y' } },
      }),
    ).toThrowError();
  });
});

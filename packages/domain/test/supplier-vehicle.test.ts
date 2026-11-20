import { describe, expect, it } from 'vitest';

import {
  SupplierCategory,
  credentialsSupersededByVehicle,
  normalizePlate,
  vehicleInsuranceUntil,
  vehicleRequestRefusal,
  vehicleReviewSms,
  type CredentialVersion,
} from '../src';

function version(overrides: Partial<CredentialVersion>): CredentialVersion {
  return {
    kind: 'LIABILITY_INSURANCE',
    status: 'VERIFIED',
    expiresOn: new Date('2027-01-31T00:00:00Z'),
    uploadedAt: new Date('2026-10-01T09:00:00Z'),
    ...overrides,
  };
}

describe('a vehicle change request (X1a)', () => {
  it('is for drivers only', () => {
    expect(vehicleRequestRefusal(SupplierCategory.PrivateDriver)).toBeNull();
    expect(vehicleRequestRefusal(SupplierCategory.TourGuide)).toBe('NOT_A_DRIVER');
    expect(vehicleRequestRefusal(SupplierCategory.HomestayHost)).toBe('NOT_A_DRIVER');
    expect(vehicleRequestRefusal(SupplierCategory.Translator)).toBe('NOT_A_DRIVER');
  });

  it('reads a plate however it is spaced or cased', () => {
    expect(normalizePlate('P 207 913')).toBe('P207913');
    expect(normalizePlate('p-207-913')).toBe('P207913');
  });
});

describe('the documents an approved vehicle supersedes (X2a)', () => {
  it('takes the inspection and the insurance when the plate changes', () => {
    expect(credentialsSupersededByVehicle('P 207 913', 'P 311 004')).toEqual([
      'TECHNICAL_INSPECTION',
      'LIABILITY_INSURANCE',
    ]);
  });

  it('keeps them for a correction of the same car', () => {
    expect(credentialsSupersededByVehicle('P 207 913', 'p207913')).toEqual([]);
  });

  it('keeps them for the first vehicle on file, which no document named before', () => {
    expect(credentialsSupersededByVehicle(null, 'P 311 004')).toEqual([]);
  });
});

describe("the vehicle's insurance date (X3a)", () => {
  it('is the verified insurance document’s expiry', () => {
    expect(
      vehicleInsuranceUntil([
        version({ kind: 'TECHNICAL_INSPECTION', expiresOn: new Date('2026-12-01') }),
        version({}),
      ]),
    ).toEqual(new Date('2027-01-31T00:00:00Z'));
  });

  it('ignores an insurance still under review or rejected', () => {
    expect(
      vehicleInsuranceUntil([
        version({ status: 'PENDING_AUDIT', expiresOn: null }),
        version({ status: 'REJECTED' }),
      ]),
    ).toBeNull();
  });

  it('takes the latest upload when two are verified', () => {
    expect(
      vehicleInsuranceUntil([
        version({}),
        version({
          uploadedAt: new Date('2026-11-01T09:00:00Z'),
          expiresOn: new Date('2027-11-30T00:00:00Z'),
        }),
      ]),
    ).toEqual(new Date('2027-11-30T00:00:00Z'));
  });
});

describe('the review SMS', () => {
  it('fits one GSM-7 segment without accents', () => {
    for (const body of [
      vehicleReviewSms(true, true),
      vehicleReviewSms(true, false),
      vehicleReviewSms(false, false),
    ]) {
      expect(body.length).toBeLessThanOrEqual(160);
      expect(body).toMatch(/^[\x20-\x7E]+$/);
    }
  });

  it('asks for the new car’s documents only when the plate changed', () => {
    expect(vehicleReviewSms(true, true)).toContain('seguro');
    expect(vehicleReviewSms(true, false)).not.toContain('seguro');
  });
});

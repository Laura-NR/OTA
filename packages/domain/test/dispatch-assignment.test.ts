import { describe, expect, it } from 'vitest';

import { SERVICE_TYPE_TO_SUPPLIER_CATEGORIES } from '../src';
import { ServiceType, SupplierCategory } from '../src';

describe('SERVICE_TYPE_TO_SUPPLIER_CATEGORIES', () => {
  it('maps guides to tour guides', () => {
    expect(SERVICE_TYPE_TO_SUPPLIER_CATEGORIES[ServiceType.Guide]).toEqual([
      SupplierCategory.TourGuide,
    ]);
  });

  it('maps transportation to private drivers', () => {
    expect(SERVICE_TYPE_TO_SUPPLIER_CATEGORIES[ServiceType.Transportation]).toEqual([
      SupplierCategory.PrivateDriver,
    ]);
  });

  it('maps accommodation to homestay hosts', () => {
    expect(SERVICE_TYPE_TO_SUPPLIER_CATEGORIES[ServiceType.Accommodation]).toEqual([
      SupplierCategory.HomestayHost,
    ]);
  });

  it('has a mapping for every service type', () => {
    for (const type of Object.values(ServiceType)) {
      expect(SERVICE_TYPE_TO_SUPPLIER_CATEGORIES[type].length).toBeGreaterThan(0);
    }
  });
});

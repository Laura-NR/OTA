import { describe, expect, it } from 'vitest';

import { isFeatureEnabled, parseTenantConfig } from '../src';

const minimal = {
  tenantId: 'cuba-eco-travel',
  branding: {
    agencyName: 'Authentic Cuba Expeditions',
    licenseNumber: 'MINTUR-2026-XXXX',
  },
};

describe('parseTenantConfig', () => {
  it('applies defaults for theme, features, and locales', () => {
    const config = parseTenantConfig(minimal);

    expect(config.primaryLocale).toBe('es');
    expect(config.supportedLocales).toEqual(['es', 'en', 'fr']);
    expect(config.destinations.geographyType).toBe('cuba_provinces');
    expect(config.features.instantBooking).toBe(false);
    expect(config.features.interactiveSvgMap).toBe(true);
  });

  it('honours explicit feature flags', () => {
    const config = parseTenantConfig({
      ...minimal,
      features: { interactiveSvgMap: false, instantBooking: true },
    });

    expect(isFeatureEnabled(config, 'interactiveSvgMap')).toBe(false);
    expect(isFeatureEnabled(config, 'instantBooking')).toBe(true);
  });

  it('defaults emergency contacts to an empty list and keeps configured ones', () => {
    expect(parseTenantConfig(minimal).emergencyContacts).toEqual([]);

    const config = parseTenantConfig({
      ...minimal,
      emergencyContacts: [{ label: 'Medical emergency', phone: '104' }],
    });
    expect(config.emergencyContacts).toEqual([
      { label: 'Medical emergency', phone: '104' },
    ]);
  });

  it('rejects a manifest without a license number', () => {
    expect(() =>
      parseTenantConfig({
        tenantId: 'x',
        branding: { agencyName: 'Agency' },
      }),
    ).toThrowError(/licenseNumber/);
  });
});

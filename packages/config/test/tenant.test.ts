import { describe, expect, it } from 'vitest';

import {
  buildTenantManifest,
  isFeatureEnabled,
  parseTenantConfig,
  slugifyTenantId,
} from '../src';

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

describe('slugifyTenantId', () => {
  it('lowercases and kebab-cases a name', () => {
    expect(slugifyTenantId('Viñales Eco Travel')).toBe('vinales-eco-travel');
  });

  it('falls back for an empty name', () => {
    expect(slugifyTenantId('  ✈  ')).toBe('tenant');
  });
});

describe('buildTenantManifest', () => {
  it('builds a complete, validated manifest with defaults', () => {
    const config = buildTenantManifest({
      tenantId: 'new-agency',
      agencyName: 'New Agency',
    });

    expect(config.tenantId).toBe('new-agency');
    expect(config.branding.agencyName).toBe('New Agency');
    expect(config.branding.licenseNumber).toBe('MINTUR-YYYY-XXXX');
    expect(config.primaryLocale).toBe('es');
    expect(config.supportedLocales).toEqual(['es', 'en', 'fr']);
    expect(config.features.instantBooking).toBe(false);
  });

  it('honours overrides and merges feature flags', () => {
    const config = buildTenantManifest({
      tenantId: 'new-agency',
      agencyName: 'New Agency',
      licenseNumber: 'MINTUR-2027-0001',
      primaryColor: '#123456',
      palette: 'sunset',
      features: { instantBooking: true },
    });

    expect(config.branding.licenseNumber).toBe('MINTUR-2027-0001');
    expect(config.branding.primaryColor).toBe('#123456');
    expect(config.theme.palette).toBe('sunset');
    expect(config.features.instantBooking).toBe(true);
    expect(config.features.interactiveSvgMap).toBe(true);
  });
});

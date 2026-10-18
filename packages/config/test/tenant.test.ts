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

const builder = {
  transports: [{ key: 'minivan', pricePerPersonDay: 28 }],
  stayStyles: [
    { key: 'standard', pricePerNight: 30 },
    { key: 'comfort', pricePerNight: 45 },
  ],
  defaultStayStyle: 'comfort',
  guiding: { sharedPerPersonDay: 25, privatePerGroupDay: 55 },
  interpreterPerGroupDay: 40,
  offsetPerNight: 5,
  feePercent: 12,
};

describe('custom builder terms', () => {
  it('has none by default, so the builder shows no estimate', () => {
    expect(parseTenantConfig(minimal).customBuilder).toBeNull();
  });

  it('reads the rates as placeholder data unless published', () => {
    const config = parseTenantConfig({ ...minimal, customBuilder: builder });
    expect(config.customBuilder).toMatchObject({
      status: 'placeholder',
      currency: 'EUR',
      spreadPercent: 6,
    });
  });

  it('refuses a default stay style that is not offered', () => {
    expect(() =>
      parseTenantConfig({
        ...minimal,
        customBuilder: { ...builder, defaultStayStyle: 'castle' },
      }),
    ).toThrow();
  });
});

describe('parseTenantConfig', () => {
  it('applies defaults for theme, features, and locales', () => {
    const config = parseTenantConfig(minimal);

    expect(config.primaryLocale).toBe('es');
    expect(config.supportedLocales).toEqual(['es', 'en', 'fr']);
    expect(config.destinations.geographyType).toBe('cuba_provinces');
    expect(config.features.instantBooking).toBe(false);
    expect(config.features.interactiveSvgMap).toBe(true);
    expect(config.payments.bankTransfer).toBeNull();
  });

  it('defaults the theme to the Vereda design system with no token overrides', () => {
    const config = parseTenantConfig(minimal);

    expect(config.branding.primaryColor).toBe('#0B4F6C');
    expect(config.theme).toEqual({
      palette: 'vereda',
      borderRadius: 'md',
      tokens: {},
    });
  });

  it('keeps primitive token overrides from the manifest', () => {
    const config = parseTenantConfig({
      ...minimal,
      theme: { tokens: { 'color-secondary-600': '#8B2F1A' } },
    });

    expect(config.theme.tokens).toEqual({ 'color-secondary-600': '#8B2F1A' });
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

  it('defaults to no child bands and no fees, and validates configured terms', () => {
    expect(parseTenantConfig(minimal).pricing).toEqual({ childBands: [], fees: [] });

    const config = parseTenantConfig({
      ...minimal,
      pricing: {
        childBands: [{ maxAge: 12, rate: 0.6 }],
        fees: [{ label: 'Service fee', unit: 'PER_BOOKING', amount: 100 }],
      },
    });
    expect(config.pricing.childBands).toEqual([{ maxAge: 12, rate: 0.6 }]);
    expect(config.pricing.fees[0]?.unit).toBe('PER_BOOKING');
    expect(() =>
      parseTenantConfig({
        ...minimal,
        pricing: { childBands: [{ maxAge: 12, rate: 1.5 }] },
      }),
    ).toThrow();
  });

  it('defaults the M4 payment terms and validates the policies', () => {
    const defaults = parseTenantConfig(minimal);
    expect(defaults.policies).toEqual({ deposit: {}, cancellation: {} });
    expect(defaults.payments).toMatchObject({
      windowHours: 48,
      cardFeePercent: 0,
      refundApproval: { singleUpTo: 500, dualUpTo: 2000 },
    });

    const config = parseTenantConfig({
      ...minimal,
      policies: {
        deposit: {
          standard: {
            percent: 20,
            minDaysBeforeDeparture: 60,
            balanceDaysBeforeDeparture: 30,
          },
        },
        cancellation: { standard: { bands: [{ fromDays: 0, keepPercent: 100 }] } },
      },
    });
    expect(config.policies.cancellation.standard?.bands[0]).toEqual({
      fromDays: 0,
      keepPercent: 100,
      fee: 0,
    });
    // The balance cannot fall due before the deposit window has closed.
    expect(() =>
      parseTenantConfig({
        ...minimal,
        policies: {
          deposit: {
            late: {
              percent: 20,
              minDaysBeforeDeparture: 30,
              balanceDaysBeforeDeparture: 45,
            },
          },
        },
      }),
    ).toThrow();
  });

  it('has no WhatsApp line unless the manifest sets one', () => {
    expect(parseTenantConfig(minimal).branding.whatsappNumber).toBeNull();
    expect(
      parseTenantConfig({
        ...minimal,
        branding: { ...minimal.branding, whatsappNumber: '+34 600 000 000' },
      }).branding.whatsappNumber,
    ).toBe('+34 600 000 000');
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

  it('defaults the wire-transfer bank details to none', () => {
    const config = buildTenantManifest({
      tenantId: 'new-agency',
      agencyName: 'New Agency',
    });

    expect(config.payments.bankTransfer).toBeNull();
  });

  it('includes the wire-transfer bank details when provided', () => {
    const config = buildTenantManifest({
      tenantId: 'new-agency',
      agencyName: 'New Agency',
      bankTransfer: {
        accountName: 'New Agency S.L.',
        bankName: 'Banco X',
        iban: 'ES00 0000 0000 0000 0000 0000',
        bic: 'XXXXES00',
        referenceNote: 'Quote the booking code.',
      },
    });

    expect(config.payments.bankTransfer).toMatchObject({
      accountName: 'New Agency S.L.',
      bankName: 'Banco X',
      iban: 'ES00 0000 0000 0000 0000 0000',
      bic: 'XXXXES00',
      referenceNote: 'Quote the booking code.',
    });
  });
});

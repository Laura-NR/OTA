import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const featureFlagsSchema = z.object({
  interactiveSvgMap: z.boolean().default(true),
  culturalEventsBanner: z.boolean().default(true),
  recruitmentPortal: z.boolean().default(true),
  customItineraryBuilder: z.boolean().default(true),
  instantBooking: z.boolean().default(false),
  directBankTransferRail: z.boolean().default(true),
  creditCardGatewayRail: z.boolean().default(true),
});

export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

/**
 * Duty-of-care contacts injected into generated vouchers and work orders
 * (spec §4.4, §8.1). Agency-specific, so they live in the tenant manifest.
 */
export const emergencyContactSchema = z.object({
  label: z.string().min(1),
  phone: z.string().min(1),
});

export type EmergencyContact = z.infer<typeof emergencyContactSchema>;

export const tenantConfigSchema = z.object({
  tenantId: z.string().min(1),
  branding: z.object({
    agencyName: z.string().min(1),
    licenseNumber: z.string().min(1),
    primaryColor: z.string().default('#0f766e'),
    supportEmail: z.string().email().nullable().default(null),
    supportPhone: z.string().nullable().default(null),
  }),
  primaryLocale: z.string().min(2).default('es'),
  supportedLocales: z.array(z.string().min(2)).min(1).default(['es', 'en', 'fr']),
  theme: z
    .object({
      palette: z.string().default('ecoGreen'),
      borderRadius: z.string().default('md'),
    })
    .prefault({}),
  features: featureFlagsSchema.prefault({}),
  destinations: z
    .object({
      geographyType: z.string().default('cuba_provinces'),
    })
    .prefault({}),
  emergencyContacts: z.array(emergencyContactSchema).default([]),
});

export type TenantConfig = z.infer<typeof tenantConfigSchema>;

/**
 * Validate a tenant manifest. This is the fork-specific `agency.config` — the
 * only file (with assets and `.env`) that differs between agency deployments.
 */
export function parseTenantConfig(raw: unknown): TenantConfig {
  return tenantConfigSchema.parse(raw);
}

export function loadTenantConfig(path: string): TenantConfig {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return parseTenantConfig(raw);
}

export function isFeatureEnabled(
  config: TenantConfig,
  flag: keyof FeatureFlags,
): boolean {
  return config.features[flag];
}

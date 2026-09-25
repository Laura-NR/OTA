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

/**
 * Bank coordinates for the manual wire-transfer rail (spec §7.1). Agency
 * specific, so they live in the tenant manifest; core never imports `tenant/`.
 */
export const bankTransferDetailsSchema = z.object({
  accountName: z.string().min(1),
  bankName: z.string().min(1),
  iban: z.string().min(4),
  bic: z.string().nullable().default(null),
  /** Optional wording shown to the traveler about the reference to quote. */
  referenceNote: z.string().nullable().default(null),
});

export type BankTransferDetails = z.infer<typeof bankTransferDetailsSchema>;

export const paymentsSchema = z.object({
  bankTransfer: bankTransferDetailsSchema.nullable().default(null),
});

export type PaymentsConfig = z.infer<typeof paymentsSchema>;

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
  payments: paymentsSchema.prefault({}),
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

/** Turn an agency name into a safe tenant id (lower-case kebab-case). */
export function slugifyTenantId(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'tenant';
}

export interface TenantManifestOptions {
  tenantId: string;
  agencyName: string;
  licenseNumber?: string;
  primaryColor?: string;
  palette?: string;
  borderRadius?: string;
  primaryLocale?: string;
  supportedLocales?: string[];
  features?: Partial<FeatureFlags>;
  emergencyContacts?: EmergencyContact[];
}

/**
 * Build a validated agency manifest for a new fork (the `create-tenant` tool).
 * Everything omitted falls back to the schema defaults, so the result is always
 * a complete, loadable manifest.
 */
export function buildTenantManifest(options: TenantManifestOptions): TenantConfig {
  return parseTenantConfig({
    tenantId: options.tenantId,
    branding: {
      agencyName: options.agencyName,
      licenseNumber: options.licenseNumber ?? 'MINTUR-YYYY-XXXX',
      ...(options.primaryColor ? { primaryColor: options.primaryColor } : {}),
    },
    ...(options.primaryLocale ? { primaryLocale: options.primaryLocale } : {}),
    ...(options.supportedLocales ? { supportedLocales: options.supportedLocales } : {}),
    ...(options.palette || options.borderRadius
      ? {
          theme: {
            ...(options.palette ? { palette: options.palette } : {}),
            ...(options.borderRadius ? { borderRadius: options.borderRadius } : {}),
          },
        }
      : {}),
    ...(options.features ? { features: options.features } : {}),
    ...(options.emergencyContacts
      ? { emergencyContacts: options.emergencyContacts }
      : {}),
  });
}

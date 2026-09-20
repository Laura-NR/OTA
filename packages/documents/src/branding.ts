/**
 * Tenant branding injected into every generated document. The MINTUR license
 * number is a regulatory requirement (spec §8.1) and must appear on vouchers,
 * invoices, and confirmations.
 */
export interface DocumentBranding {
  agencyName: string;
  licenseNumber: string;
  primaryColor: string;
  supportEmail: string | null;
  supportPhone: string | null;
}

export function brandingFromEnv(env: NodeJS.ProcessEnv = process.env): DocumentBranding {
  return {
    agencyName: env.AGENCY_NAME ?? 'Authentic Cuba Expeditions',
    licenseNumber: env.MINTUR_LICENSE ?? 'MINTUR-TEST-0000',
    primaryColor: env.AGENCY_PRIMARY_COLOR ?? '#0f766e',
    supportEmail: env.AGENCY_SUPPORT_EMAIL ?? null,
    supportPhone: env.AGENCY_SUPPORT_PHONE ?? null,
  };
}

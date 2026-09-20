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

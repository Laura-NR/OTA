export interface DocumentEmergencyContact {
  label: string;
  phone: string;
}

/**
 * Tenant branding injected into every generated document. The MINTUR license
 * number is a regulatory requirement (spec §8.1) and must appear on vouchers,
 * invoices, and confirmations. Emergency contacts feed the duty-of-care block
 * on vouchers and work orders (spec §4.4, §8.1).
 */
export interface DocumentBranding {
  agencyName: string;
  licenseNumber: string;
  primaryColor: string;
  supportEmail: string | null;
  supportPhone: string | null;
  emergencyContacts: readonly DocumentEmergencyContact[];
}

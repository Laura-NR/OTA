import type { TenantConfig } from '@ota/config';

/** The storefront origin used in transactional email links. */
export function storefrontBaseUrl(): string {
  return (
    process.env.STOREFRONT_PUBLIC_URL ??
    process.env.PAYMENT_CHECKOUT_BASE_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

/** A storefront page in the traveler's locale; the tenant's primary locale is unprefixed. */
export function storefrontPageUrl(
  tenant: TenantConfig,
  locale: string | null | undefined,
  path: string,
): string {
  const language = locale?.trim() || tenant.primaryLocale;
  const prefix = language === tenant.primaryLocale ? '' : `/${language}`;
  return `${storefrontBaseUrl()}${prefix}${path}`;
}

/** A traveler's trip page, with the tenant's primary locale left unprefixed. */
export function accountReservationUrl(
  tenant: TenantConfig,
  locale: string | null | undefined,
  reservationId: string,
): string {
  return storefrontPageUrl(tenant, locale, `/account/reservations/${reservationId}`);
}

/** A trip's Confirmation screen, reached once the first payment confirmed it. */
export function accountConfirmationUrl(
  tenant: TenantConfig,
  locale: string | null | undefined,
  reservationId: string,
): string {
  return storefrontPageUrl(
    tenant,
    locale,
    `/account/reservations/${reservationId}/confirmation`,
  );
}

/** A traveler's proposal page, behind the same sign-in as the trip page. */
export function accountProposalUrl(
  tenant: TenantConfig,
  locale: string | null | undefined,
  proposalId: string,
): string {
  return storefrontPageUrl(tenant, locale, `/account/proposals/${proposalId}`);
}

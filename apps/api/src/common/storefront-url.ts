import type { TenantConfig } from '@ota/config';

/** The storefront origin used in transactional email links. */
export function storefrontBaseUrl(): string {
  return (
    process.env.STOREFRONT_PUBLIC_URL ??
    process.env.PAYMENT_CHECKOUT_BASE_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

/** A traveler's trip page, with the tenant's primary locale left unprefixed. */
export function accountReservationUrl(
  tenant: TenantConfig,
  locale: string | null | undefined,
  reservationId: string,
): string {
  const language = locale?.trim() || tenant.primaryLocale;
  const prefix = language === tenant.primaryLocale ? '' : `/${language}`;
  return `${storefrontBaseUrl()}${prefix}/account/reservations/${reservationId}`;
}

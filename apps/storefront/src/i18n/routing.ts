import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@ota/i18n';
import { defineRouting } from 'next-intl/routing';

/**
 * Locale routing for the storefront. The default locale is served without a
 * prefix (`/catalog`); other locales are prefixed (`/en/catalog`).
 */
export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
});

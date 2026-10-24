import { DEFAULT_LOCALE, isSupportedLocale, loadMessages } from '@ota/i18n';
import { PRIMITIVE_TOKENS, themeCssVariables } from '@ota/theming';
import type { MetadataRoute } from 'next';
import { createTranslator } from 'next-intl';

import { brand } from '@/lib/brand';
import { getTenantConfig } from '@/lib/tenant';

/**
 * The web app manifest (Phase 8 item 2), so a traveler can add the site to a
 * phone's home screen and open the saved trips from it. Named and coloured
 * from the tenant manifest; the icon is the agency's SVG mark until raster
 * icons are exported (Phase 1, T-Signoff §03).
 */
export default function manifest(): MetadataRoute.Manifest {
  const tenant = getTenantConfig();
  const tokens = themeCssVariables(tenant);
  const locale = isSupportedLocale(tenant.primaryLocale)
    ? tenant.primaryLocale
    : DEFAULT_LOCALE;
  const t = createTranslator({
    locale,
    messages: loadMessages(locale),
    namespace: 'metadata',
  });

  return {
    id: '/',
    name: tenant.branding.agencyName,
    short_name: tenant.branding.agencyName,
    description: t('description', { agency: tenant.branding.agencyName }),
    lang: locale,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: tokens['--color-primary-600'] ?? PRIMITIVE_TOKENS['color-primary-600'],
    background_color:
      tokens['--color-neutral-50'] ?? PRIMITIVE_TOKENS['color-neutral-50'],
    icons: [
      { src: brand.favicon.src, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}

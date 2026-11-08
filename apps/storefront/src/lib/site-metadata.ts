import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { brand } from '@/lib/brand';
import { getTenantConfig } from '@/lib/tenant';

/** The site's title, description and icon in a locale: the locale layout's, and the root 404's. */
export async function siteMetadata(locale: string): Promise<Metadata> {
  const tenant = getTenantConfig();
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return {
    title: t('title', { agency: tenant.branding.agencyName }),
    description: t('description', { agency: tenant.branding.agencyName }),
    icons: { icon: brand.favicon.src },
  };
}

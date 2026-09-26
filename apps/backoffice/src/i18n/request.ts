import { DEFAULT_LOCALE, isSupportedLocale, loadMessages, type Locale } from '@ota/i18n';
import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

import { getTenantConfig } from '@/lib/tenant';

import { LOCALE_COOKIE } from './locale';

/**
 * Resolve the back-office language without URL routing: an explicit cookie wins,
 * then the browser's `Accept-Language`, then the tenant's primary locale. This
 * keeps `/suppliers` etc. stable (no locale prefixes) while still honouring es/en/fr.
 */
export async function resolveLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }

  const accept = (await headers()).get('accept-language') ?? '';
  for (const part of accept.split(',')) {
    const base = part.trim().split(';')[0]?.split('-')[0];
    if (isSupportedLocale(base)) {
      return base;
    }
  }

  const tenantDefault = getTenantConfig().primaryLocale;
  return isSupportedLocale(tenantDefault) ? tenantDefault : DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return { locale, messages: loadMessages(locale) };
});

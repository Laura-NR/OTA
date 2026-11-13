import { isSupportedLocale, loadMessages, mergeMessages, type Locale } from '@ota/i18n';
import { getRequestConfig } from 'next-intl/server';

import { getTenantMessages } from '@/lib/tenant';

import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = isSupportedLocale(requested) ? requested : routing.defaultLocale;

  // Core copy, then the tenant's: its English page content stands in where a
  // locale has none yet (English ships first), then the locale's own file.
  const english = getTenantMessages('en');
  return {
    locale,
    messages: mergeMessages(
      loadMessages(locale),
      english.content ? { content: english.content } : {},
      getTenantMessages(locale),
    ),
  };
});

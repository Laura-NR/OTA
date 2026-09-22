import { isSupportedLocale, loadMessages, type Locale } from '@ota/i18n';
import { getRequestConfig } from 'next-intl/server';

import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = isSupportedLocale(requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: loadMessages(locale),
  };
});

import {
  BASE_CURRENCY,
  CURRENCY_COOKIE,
  resolveDisplayCurrency,
  type DisplayCurrencyCode,
} from '@ota/domain';
import { publicCurrenciesSchema, type PublicCurrenciesDto } from '@ota/schemas';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';

import { apiBaseUrl, apiFetch } from './api';
import { EUR_ONLY, type DisplayMoney } from './display-money';

/** The rates shown today, or none when the API cannot be reached (EUR only). */
async function publicCurrencies(): Promise<PublicCurrenciesDto | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/catalog/currencies`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const parsed = publicCurrenciesSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The visitor's display currency for this request
 * (`docs/schema-m9-display-currencies.md` C4a): a signed-in traveler's saved
 * choice, then the `ota_currency` cookie, then their browser language's
 * region. Read once per request.
 */
export const getDisplayCurrency = cache(async (): Promise<DisplayMoney> => {
  const rates = await publicCurrencies();
  if (!rates || rates.currencies.length === 0) {
    return { ...EUR_ONLY, lockAt: rates?.lockAt ?? EUR_ONLY.lockAt };
  }
  const [store, requestHeaders, profile] = await Promise.all([
    cookies(),
    headers(),
    apiFetch<{ displayCurrency: string | null }>('/me').catch(() => null),
  ]);
  const code = resolveDisplayCurrency({
    saved: profile?.displayCurrency,
    cookie: store.get(CURRENCY_COOKIE)?.value,
    acceptLanguage: requestHeaders.get('accept-language'),
    enabled: rates.currencies.map((currency) => currency.code as DisplayCurrencyCode),
  });
  return {
    code,
    rate: rates.currencies.find((currency) => currency.code === code)?.rate ?? null,
    rateDate: rates.rateDate,
    options: [
      { code: BASE_CURRENCY, rate: null },
      ...rates.currencies.map((currency) => ({
        code: currency.code,
        rate: currency.rate,
      })),
    ],
    lockAt: rates.lockAt,
    signedIn: profile !== null,
  };
});

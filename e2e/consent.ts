import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The version of the tenant's analytics cookie words, which the storefront's
 * banner compares the cookie against (`tenant/messages/en.json`).
 */
export const ANALYTICS_WORDS_VERSION: string =
  (
    JSON.parse(readFileSync(resolve('tenant/messages/en.json'), 'utf8')) as {
      content?: { legal?: { consents?: { COOKIES_ANALYTICS?: { version: string } } } };
    }
  ).content?.legal?.consents?.COOKIES_ANALYTICS?.version ?? '';

/**
 * An `ota_consent` value, in the format of `serializeCookieChoice`
 * (@ota/domain): the visitor chose for the words in force, so the DS 04
 * banner stays away.
 */
export function consentCookieValue(analytics: boolean): string {
  return encodeURIComponent(
    new URLSearchParams({
      a: analytics ? '1' : '0',
      av: ANALYTICS_WORDS_VERSION,
      m: '0',
      mv: '',
      t: String(Date.now()),
    }).toString(),
  );
}

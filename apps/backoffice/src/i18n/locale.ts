/**
 * Client-safe i18n constants. Kept out of `request.ts` so client components can
 * read the cookie name without pulling `next/headers` into the browser bundle.
 */
export const LOCALE_COOKIE = 'OTA_LOCALE';

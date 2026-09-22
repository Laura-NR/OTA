/** Locales the platform ships catalogs for (spec §10.3, es/en/fr). */
export const SUPPORTED_LOCALES = ['es', 'en', 'fr'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';

export function isSupportedLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  loadMessages,
} from '../src';

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('@ota/i18n', () => {
  it('exposes the supported locales with a default', () => {
    expect(SUPPORTED_LOCALES).toEqual(['es', 'en', 'fr']);
    expect(DEFAULT_LOCALE).toBe('es');
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('de')).toBe(false);
  });

  it('keeps every locale in step with the reference catalog', () => {
    const reference = flatten(loadMessages('en')).sort();
    for (const locale of SUPPORTED_LOCALES) {
      expect(flatten(loadMessages(locale)).sort()).toEqual(reference);
    }
  });
});

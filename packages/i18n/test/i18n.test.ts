import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  loadMessages,
  mergeMessages,
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

describe('mergeMessages', () => {
  it('overrides leaves, merges objects and leaves the base untouched', () => {
    const base = { nav: { home: 'Home', support: 'Support' }, footer: { license: 'L' } };
    const merged = mergeMessages(
      base,
      { nav: { support: 'Help' } },
      { content: { a: 1 } },
    );

    expect(merged).toEqual({
      nav: { home: 'Home', support: 'Help' },
      footer: { license: 'L' },
      content: { a: 1 },
    });
    expect(base.nav.support).toBe('Support');
  });

  it('replaces arrays wholesale rather than merging them by index', () => {
    expect(mergeMessages({ items: ['a', 'b'] }, { items: ['c'] })).toEqual({
      items: ['c'],
    });
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ALIAS_TOKENS, COMPONENT_TOKENS, PRIMITIVE_TOKENS } from '@ota/theming';
import { describe, expect, it } from 'vitest';

import { cn } from '../src/cn';

type ColorScale = Record<string, string | Record<string, string>>;

const { default: preset, TYPE_SCALE } = (await import('../tailwind-preset.mjs')) as {
  default: {
    theme: {
      screens: Record<string, string>;
      colors: Record<string, string | ColorScale>;
      borderRadius: Record<string, string>;
      boxShadow: Record<string, string>;
      extend: {
        backgroundColor: ColorScale;
        textColor: ColorScale;
        borderColor: ColorScale;
        transitionDuration: Record<string, string>;
      };
    };
  };
  TYPE_SCALE: Record<string, [string, { lineHeight: string; fontWeight?: string }]>;
};

const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');

/**
 * Prettier rewrites CSS values (hex case, quotes, spacing, `.10` → `0.1`), so
 * compare them normalised; numbers compare by value, hex digits as text.
 */
function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/'/g, '"')
    .replace(/\s+/g, '')
    .replace(/(?<![#\w.])(\d*\.\d+|\d+)/g, (number) => String(Number(number)));
}

function declared(css: string): Record<string, string> {
  return Object.fromEntries(
    [...css.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [
      match[1]!,
      match[2]!.trim(),
    ]),
  );
}

describe('cn', () => {
  it('lets the last conflicting utility win', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('drops falsy values', () => {
    expect(cn('text-body-sm', undefined, null, '')).toBe('text-body-sm');
  });

  it('keeps a type size next to a text colour', () => {
    expect(cn('text-h1', 'text-default')).toBe('text-h1 text-default');
    expect(cn('text-body-sm', 'text-h3')).toBe('text-h3');
    expect(cn('text-muted', 'text-primary-600')).toBe('text-primary-600');
    expect(cn('text-label', 'text-warning-700')).toBe('text-label text-warning-700');
    expect(cn('text-nav', 'text-h1-compact')).toBe('text-h1-compact');
  });
});

describe('styles.css', () => {
  it('declares every design token with the value @ota/theming holds', () => {
    const css = declared(styles.slice(0, styles.indexOf('@media')));

    for (const [name, value] of Object.entries({
      ...PRIMITIVE_TOKENS,
      ...ALIAS_TOKENS,
      ...COMPONENT_TOKENS,
    })) {
      expect(normalized(css[name] ?? ''), name).toBe(normalized(value));
    }
    expect(css['color-text-on-primary']).toBe('var(--color-neutral-0)');
  });

  it('turns motion off for people who ask for reduced motion', () => {
    const reduced = styles.slice(
      styles.indexOf('@media (prefers-reduced-motion: reduce)'),
    );
    for (const name of ['motion-fast', 'motion-base', 'motion-slow']) {
      expect(reduced).toContain(`--${name}: 0ms !important`);
    }
  });
});

describe('tailwind preset', () => {
  it('maps palette steps and aliases onto the tokens with opacity support', () => {
    const primary = preset.theme.colors.primary as Record<string, string>;
    expect(primary['600']).toBe(
      'color-mix(in srgb, var(--color-primary-600) calc(<alpha-value> * 100%), transparent)',
    );
    expect(preset.theme.extend.backgroundColor.page).toContain('var(--color-bg-page)');
    expect(
      (preset.theme.extend.backgroundColor['action-primary'] as Record<string, string>)
        .hover,
    ).toContain('var(--color-action-primary-hover)');
    expect(preset.theme.extend.textColor.default).toContain('var(--color-text-default)');
    expect(
      (preset.theme.extend.textColor.secondary as Record<string, string>).DEFAULT,
    ).toContain('var(--color-text-secondary)');
    expect(preset.theme.extend.borderColor.input).toContain('var(--color-border-input)');
  });

  it('offers only the design palette', () => {
    expect(Object.keys(preset.theme.colors).sort()).toEqual(
      [
        'accent',
        'current',
        'error',
        'info',
        'inherit',
        'neutral',
        'primary',
        'secondary',
        'success',
        'timeout',
        'transparent',
        'warning',
      ].sort(),
    );
  });

  it('offers a step for every colour primitive, and no other', () => {
    const offered = Object.entries(preset.theme.colors).flatMap(([family, scale]) =>
      typeof scale === 'string'
        ? []
        : Object.keys(scale).map((step) => `color-${family}-${step}`),
    );
    const primitives = Object.keys(PRIMITIVE_TOKENS).filter((name) =>
      name.startsWith('color-'),
    );
    expect(offered.sort()).toEqual(primitives.sort());
  });

  it('has a size for every type token', () => {
    // A type token's value is a font shorthand: "600 13px/16px var(--font-body)".
    const typeTokens = Object.entries({ ...ALIAS_TOKENS, ...COMPONENT_TOKENS })
      .filter(([name, value]) => name.startsWith('text-') && /^\d{3} \d+px\//.test(value))
      .map(([name]) => name.replace(/^text-/, ''));
    expect(Object.keys(TYPE_SCALE).sort()).toEqual(typeTokens.sort());
  });

  it('copies the type tokens exactly', () => {
    for (const [name, [size, { lineHeight, fontWeight }]] of Object.entries(TYPE_SCALE)) {
      const token =
        (ALIAS_TOKENS as Record<string, string>)[`text-${name}`] ??
        (COMPONENT_TOKENS as Record<string, string>)[`text-${name}`];
      const [weight, sizeAndLine] = token!.split(' ');
      expect(sizeAndLine, name).toBe(`${size}/${lineHeight}`);
      expect(fontWeight ?? '400', name).toBe(weight);
    }
  });

  it('uses the token radii, shadows, motion and DS 07 breakpoints', () => {
    expect(preset.theme.borderRadius.md).toBe('var(--radius-md)');
    expect(preset.theme.borderRadius.DEFAULT).toBe('var(--radius-md)');
    expect(preset.theme.boxShadow.md).toBe('var(--shadow-md)');
    expect(preset.theme.screens).toEqual({
      sm: PRIMITIVE_TOKENS['bp-sm'],
      md: PRIMITIVE_TOKENS['bp-md'],
      lg: PRIMITIVE_TOKENS['bp-lg'],
      xl: PRIMITIVE_TOKENS['bp-xl'],
    });
    expect(PRIMITIVE_TOKENS['motion-fast']).toContain(
      preset.theme.extend.transitionDuration.fast,
    );
    expect(PRIMITIVE_TOKENS['motion-slow']).toContain(
      preset.theme.extend.transitionDuration.slow,
    );
  });
});

describe('icons', () => {
  it('has a sprite symbol for every icon name, once', async () => {
    const { ICON_NAMES, ICON_SPRITE_SYMBOLS } = await import('../src/icons/sprite');

    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    for (const name of ICON_NAMES) {
      expect(ICON_SPRITE_SYMBOLS).toContain(
        `<symbol id="icon-${name}" viewBox="0 0 24 24">`,
      );
    }
    expect(ICON_SPRITE_SYMBOLS.match(/<symbol /g)).toHaveLength(ICON_NAMES.length);
  });

  it('hides decorative icons and names meaningful ones', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { Icon } = await import('../src/components/icon');

    const decorative = renderToStaticMarkup(createElement(Icon, { name: 'search' }));
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).toContain('href="#icon-search"');
    expect(decorative).not.toContain('role="img"');

    const named = renderToStaticMarkup(
      createElement(Icon, { name: 'wifi-off', label: 'Offline' }),
    );
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Offline"');
    expect(named).not.toContain('aria-hidden');
  });
});

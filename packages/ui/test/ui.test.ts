import { describe, expect, it } from 'vitest';

import { cn } from '../src/cn';

const preset = (await import('../tailwind-preset.mjs')).default as {
  theme: {
    extend: {
      colors: Record<
        string,
        { DEFAULT: string; foreground?: string; accent?: { DEFAULT: string } }
      >;
      borderRadius: Record<string, string>;
    };
  };
};

describe('cn', () => {
  it('lets the last conflicting utility win', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('drops falsy values', () => {
    expect(cn('text-sm', undefined, null, '')).toBe('text-sm');
  });
});

describe('tailwind preset', () => {
  it('maps semantic colours to the --ota design tokens', () => {
    expect(preset.theme.extend.colors.primary.DEFAULT).toBe(
      'hsl(var(--ota-primary) / <alpha-value>)',
    );
    expect(preset.theme.extend.colors.sidebar.accent.DEFAULT).toBe(
      'hsl(var(--ota-sidebar-accent) / <alpha-value>)',
    );
  });

  it('maps the radius token', () => {
    expect(preset.theme.extend.borderRadius.lg).toBe('var(--ota-radius)');
  });
});

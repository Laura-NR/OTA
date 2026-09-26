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
      boxShadow: Record<string, string>;
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
    expect(preset.theme.extend.colors.warning.DEFAULT).toBe(
      'hsl(var(--ota-warning) / <alpha-value>)',
    );
    expect(preset.theme.extend.colors.timeout.DEFAULT).toBe(
      'hsl(var(--ota-timeout) / <alpha-value>)',
    );
  });

  it('maps the design radius steps', () => {
    expect(preset.theme.extend.borderRadius.sm).toBe('var(--ota-radius-sm)');
    expect(preset.theme.extend.borderRadius.md).toBe('var(--ota-radius-md)');
    expect(preset.theme.extend.borderRadius.lg).toBe('var(--ota-radius-lg)');
  });

  it('exposes the two warm-tinted elevation levels', () => {
    expect(preset.theme.extend.boxShadow['ota-1']).toContain('rgba(36, 30, 25, 0.08)');
    expect(preset.theme.extend.boxShadow['ota-2']).toContain('0.16');
  });
});

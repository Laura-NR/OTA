import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseTenantConfig } from '@ota/config';
import { describe, expect, it } from 'vitest';

import { contrastRatio, derivePrimaryScale, normalizeHex } from '../src/color';
import { themeCssVariables } from '../src/css';
import { ALIAS_TOKENS, COMPONENT_TOKENS, PRIMITIVE_TOKENS } from '../src/tokens';

const base = {
  tenantId: 'vereda-expeditions',
  branding: {
    agencyName: 'Vereda Expeditions',
    licenseNumber: 'MINTUR-2026-XXXX',
  },
};

interface ExportedTier {
  [name: string]: { value: string };
}

const designExport = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../design/vereda-v1.2/handoff/tokens.json'),
    'utf8',
  ),
) as {
  primitive: ExportedTier;
  alias: ExportedTier;
  component: ExportedTier;
  reducedMotion: Record<string, string>;
};

function values(tier: ExportedTier): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tier).map(([name, token]) => [name.replace(/^--/, ''), token.value]),
  );
}

describe('the token contract', () => {
  it('carries every token of the design export, by tier', () => {
    expect(Object.keys(PRIMITIVE_TOKENS).sort()).toEqual(
      Object.keys(values(designExport.primitive)).sort(),
    );
    expect(ALIAS_TOKENS).toEqual(values(designExport.alias));
    expect(COMPONENT_TOKENS).toEqual(values(designExport.component));
  });

  it('matches every exported primitive value', () => {
    expect(PRIMITIVE_TOKENS).toEqual(values(designExport.primitive));
    // Motion is the DS-Handoff values; the export lists the reduced-motion
    // override separately (change request 01, A1).
    expect(PRIMITIVE_TOKENS['motion-base']).toBe('200ms cubic-bezier(.2,.8,.2,1)');
    expect(designExport.reducedMotion['--motion-base']).toBe('0ms');
  });

  it('draws the focus ring in primary 600, 8.4:1 on the cream page (A-A11y)', () => {
    expect(COMPONENT_TOKENS['color-focus-ring']).toBe('var(--color-primary-600)');
    expect(
      contrastRatio(
        PRIMITIVE_TOKENS['color-primary-600'],
        PRIMITIVE_TOKENS['color-neutral-50'],
      ),
    ).toBeCloseTo(8.4, 1);
  });

  it('meets the contrast figures of the Foundations sheet', () => {
    // White on primary.600 is 8.9:1 and neutral.500 helper text 5.6:1 (Main.dc.html).
    expect(contrastRatio('#FFFFFF', PRIMITIVE_TOKENS['color-primary-600'])).toBeCloseTo(
      8.9,
      1,
    );
    expect(contrastRatio('#FFFFFF', PRIMITIVE_TOKENS['color-neutral-500'])).toBeCloseTo(
      5.6,
      1,
    );
    // Status text is the -700 tone on its -100 surface. DS 06 says 7:1 or
    // better; warning (6.4:1) and error (5.7:1) fall short of that but stay AA
    // (raised in change request 02). The -600 tones, which the boards keep for
    // icons and field errors, stay AA too.
    for (const status of ['success', 'warning', 'error', 'info'] as const) {
      const surface = PRIMITIVE_TOKENS[`color-${status}-100`];
      const text = contrastRatio(PRIMITIVE_TOKENS[`color-${status}-700`], surface)!;
      expect(text, status).toBeGreaterThanOrEqual(5.7);
      expect(text, status).toBeGreaterThan(
        contrastRatio(PRIMITIVE_TOKENS[`color-${status}-600`], surface)!,
      );
      expect(
        contrastRatio(PRIMITIVE_TOKENS[`color-${status}-600`], surface),
        status,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('derivePrimaryScale', () => {
  it('reproduces the design teal scale from its step 600', () => {
    const scale = derivePrimaryScale('#0b4f6c')!;

    for (const step of [700, 600, 200, 100, 50] as const) {
      expect(scale[step], String(step)).toBe(PRIMITIVE_TOKENS[`color-primary-${step}`]);
    }
  });

  it('keeps the brand colour as step 600 and orders the steps by lightness', () => {
    const scale = derivePrimaryScale('#7a1f5c')!;

    expect(scale[600]).toBe('#7A1F5C');
    expect(contrastRatio('#FFFFFF', scale[700])!).toBeGreaterThan(
      contrastRatio('#FFFFFF', scale[600])!,
    );
    expect(contrastRatio('#FFFFFF', scale[500])!).toBeLessThan(
      contrastRatio('#FFFFFF', scale[600])!,
    );
    expect(contrastRatio('#FFFFFF', scale[200])!).toBeGreaterThan(
      contrastRatio('#FFFFFF', scale[100])!,
    );
    expect(contrastRatio('#FFFFFF', scale[100])!).toBeGreaterThan(
      contrastRatio('#FFFFFF', scale[50])!,
    );
    expect(contrastRatio('#FFFFFF', scale[100])!).toBeLessThan(1.2);
  });

  it('returns null for a non-hex colour', () => {
    expect(derivePrimaryScale('rebeccapurple')).toBeNull();
    expect(normalizeHex('#f00')).toBe('#FF0000');
  });
});

describe('themeCssVariables', () => {
  it('compiles the default tenant to no overrides', () => {
    expect(themeCssVariables(parseTenantConfig(base))).toEqual({});
    expect(
      themeCssVariables(
        parseTenantConfig({
          ...base,
          branding: { ...base.branding, primaryColor: '#0b4f6c' },
        }),
      ),
    ).toEqual({});
  });

  it('derives the primary scale from a different brand colour', () => {
    const variables = themeCssVariables(
      parseTenantConfig({
        ...base,
        branding: { ...base.branding, primaryColor: '#7a1f5c' },
      }),
    );

    expect(variables['--color-primary-600']).toBe('#7A1F5C');
    expect(Object.keys(variables).sort()).toEqual([
      '--color-primary-100',
      '--color-primary-200',
      '--color-primary-50',
      '--color-primary-500',
      '--color-primary-600',
      '--color-primary-700',
    ]);
  });

  it('switches text on primary to ink when the brand colour is light', () => {
    const variables = themeCssVariables(
      parseTenantConfig({
        ...base,
        branding: { ...base.branding, primaryColor: '#ffd23f' },
      }),
    );

    expect(variables['--color-text-on-primary']).toBe('var(--color-neutral-900)');
  });

  it('applies primitive overrides and ignores alias, component and unknown names', () => {
    const variables = themeCssVariables(
      parseTenantConfig({
        ...base,
        theme: {
          tokens: {
            'color-secondary-600': '#8B2F1A',
            'color-action-primary': 'var(--color-secondary-600)',
            'color-focus-ring': 'red',
            'not-a-token': '1px',
          },
        },
      }),
    );

    expect(variables).toEqual({ '--color-secondary-600': '#8B2F1A' });
  });

  it('scales the radius steps but never the pill radius', () => {
    const variables = themeCssVariables(
      parseTenantConfig({ ...base, theme: { borderRadius: 'lg' } }),
    );

    expect(variables).toEqual({
      '--radius-sm': '6px',
      '--radius-md': '12px',
      '--radius-lg': '18px',
    });
    expect(
      themeCssVariables(parseTenantConfig({ ...base, theme: { borderRadius: 'none' } }))[
        '--radius-md'
      ],
    ).toBe('0px');
  });

  it('falls back to the Vereda preset for an unknown palette and radius', () => {
    expect(
      themeCssVariables(
        parseTenantConfig({
          ...base,
          theme: { palette: 'ecoGreen', borderRadius: 'enormous' },
        }),
      ),
    ).toEqual({});
  });

  it('never emits the font families or the breakpoints, which the build owns', () => {
    const variables = themeCssVariables(
      parseTenantConfig({
        ...base,
        theme: { tokens: { 'font-body': '"Comic Sans MS"', 'bp-md': '700px' } },
      }),
    );

    expect(variables).toEqual({});
  });
});

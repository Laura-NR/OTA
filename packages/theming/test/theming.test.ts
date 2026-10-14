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
    resolve(__dirname, '../../../design/vereda-v1.1/handoff/tokens.json'),
    'utf8',
  ),
) as { primitive: ExportedTier; alias: ExportedTier; component: ExportedTier };

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

  it('matches the exported primitive values except motion, which uses DS-Handoff', () => {
    const exported = values(designExport.primitive);
    for (const [name, value] of Object.entries(PRIMITIVE_TOKENS)) {
      if (name.startsWith('motion-')) {
        // The export carries the reduced-motion 0ms (change request 01, A1).
        expect(exported[name]).toBe('0ms');
        continue;
      }
      expect(value, name).toBe(exported[name]);
    }
    expect(PRIMITIVE_TOKENS['motion-base']).toBe('200ms cubic-bezier(.2,.8,.2,1)');
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
    // Status text stays AA on its -100 surface (the -700 tones are not tokens yet).
    for (const status of ['success', 'warning', 'error', 'info'] as const) {
      const ratio = contrastRatio(
        PRIMITIVE_TOKENS[`color-${status}-600`],
        PRIMITIVE_TOKENS[`color-${status}-100`],
      );
      expect(ratio, status).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('derivePrimaryScale', () => {
  it('keeps the brand colour as step 600 and orders the steps by lightness', () => {
    const scale = derivePrimaryScale('#0b4f6c')!;

    expect(scale[600]).toBe('#0B4F6C');
    expect(contrastRatio('#FFFFFF', scale[700])!).toBeGreaterThan(
      contrastRatio('#FFFFFF', scale[600])!,
    );
    expect(contrastRatio('#FFFFFF', scale[500])!).toBeLessThan(
      contrastRatio('#FFFFFF', scale[600])!,
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

  it('never emits the font families, which the font loader owns', () => {
    const variables = themeCssVariables(
      parseTenantConfig({
        ...base,
        theme: { tokens: { 'font-body': '"Comic Sans MS"' } },
      }),
    );

    expect(variables).toEqual({});
  });
});

import { parseTenantConfig } from '@ota/config';
import { describe, expect, it } from 'vitest';

import { hexToHslTriple, relativeLuminance } from '../src/color';
import { themeCssVariables } from '../src/css';
import { THEME_PRESETS, THEME_TOKEN_KEYS } from '../src/tokens';

const base = {
  tenantId: 'cuba-eco-travel',
  branding: {
    agencyName: 'Authentic Cuba Expeditions',
    licenseNumber: 'MINTUR-2026-XXXX',
  },
};

describe('hexToHslTriple', () => {
  it('maps the primary colours exactly', () => {
    expect(hexToHslTriple('#ffffff')).toBe('0 0% 100%');
    expect(hexToHslTriple('#000000')).toBe('0 0% 0%');
    expect(hexToHslTriple('#ff0000')).toBe('0 100% 50%');
    expect(hexToHslTriple('#00ff00')).toBe('120 100% 50%');
    expect(hexToHslTriple('#0000ff')).toBe('240 100% 50%');
  });

  it('accepts shorthand hex', () => {
    expect(hexToHslTriple('#f00')).toBe('0 100% 50%');
  });

  it('returns null for a non-hex colour', () => {
    expect(hexToHslTriple('rebeccapurple')).toBeNull();
    expect(hexToHslTriple('#xyz')).toBeNull();
  });
});

describe('relativeLuminance', () => {
  it('orders black below white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });
});

describe('themeCssVariables', () => {
  it('emits every design token as an --ota-* custom property', () => {
    const variables = themeCssVariables(parseTenantConfig(base));

    for (const token of THEME_TOKEN_KEYS) {
      expect(variables[`--ota-${token}`]).toBeTruthy();
    }
    expect(variables['--ota-radius']).toBe('0.5rem');
  });

  it('overrides the preset primary with the tenant brand colour', () => {
    const variables = themeCssVariables(
      parseTenantConfig({
        ...base,
        branding: { ...base.branding, primaryColor: '#ff0000' },
      }),
    );

    expect(variables['--ota-primary']).toBe('0 100% 50%');
    expect(variables['--ota-primary-foreground']).toBe('0 0% 100%');
  });

  it('picks a dark foreground over a light brand colour', () => {
    const variables = themeCssVariables(
      parseTenantConfig({
        ...base,
        branding: { ...base.branding, primaryColor: '#ffff00' },
      }),
    );

    expect(variables['--ota-primary-foreground']).toBe('0 0% 9%');
  });

  it('uses the requested palette', () => {
    const variables = themeCssVariables(
      parseTenantConfig({ ...base, theme: { palette: 'oceanBlue' } }),
    );

    // Primary is overridden by the brand colour, so assert on a preset token.
    expect(variables['--ota-sidebar']).toBe('215 40% 16%');
  });

  it('emits the distinct warning and timeout alert tokens', () => {
    const variables = themeCssVariables(
      parseTenantConfig({ ...base, theme: { palette: 'vereda' } }),
    );

    // Tabaco doubles as the general accent and the Warning token; timeout is the
    // dispatch Amber Alert, deliberately a different hue.
    expect(variables['--ota-warning']).toBe('36 64% 48%');
    expect(variables['--ota-timeout']).toBe('27 71% 51%');
    expect(variables['--ota-warning']).not.toBe(variables['--ota-timeout']);
  });

  it('ships the default design palette from docs/design.md', () => {
    const vereda = THEME_PRESETS.vereda;
    expect(vereda?.palette.primary).toBe('165 37% 27%');
    expect(vereda?.palette.background).toBe('41 35% 89%');
  });

  it('falls back for an unknown palette and radius', () => {
    const variables = themeCssVariables(
      parseTenantConfig({
        ...base,
        theme: { palette: 'doesNotExist', borderRadius: 'enormous' },
      }),
    );

    expect(variables['--ota-primary']).toBeTruthy();
    expect(variables['--ota-radius']).toBe('0.5rem');
  });
});

import type { TenantConfig } from '@ota/config';

import { hexToHslTriple, relativeLuminance } from './color';
import {
  DEFAULT_PALETTE,
  RADIUS_SCALE,
  THEME_PRESETS,
  THEME_TOKEN_KEYS,
  type ThemePalette,
} from './tokens';

const LIGHT_FOREGROUND = '0 0% 100%';
const DARK_FOREGROUND = '0 0% 9%';

function resolvePalette(config: TenantConfig): ThemePalette {
  const preset = THEME_PRESETS[config.theme.palette] ?? THEME_PRESETS[DEFAULT_PALETTE];
  const palette = { ...preset!.palette };

  // The tenant's single brand colour wins over the preset's primary, and a
  // readable foreground is chosen from its luminance. An unparseable value
  // (e.g. a CSS keyword) is ignored rather than crashing the app shell.
  const primary = hexToHslTriple(config.branding.primaryColor);
  if (primary) {
    palette.primary = primary;
    const luminance = relativeLuminance(config.branding.primaryColor);
    palette['primary-foreground'] =
      luminance !== null && luminance > 0.5 ? DARK_FOREGROUND : LIGHT_FOREGROUND;
  }

  return palette;
}

/**
 * Compile a tenant manifest into the `--ota-*` CSS custom properties consumed
 * by `packages/ui`'s Tailwind preset. Unknown palettes and radius names fall
 * back to the defaults so a malformed fork still renders.
 */
export function themeCssVariables(config: TenantConfig): Record<string, string> {
  const palette = resolvePalette(config);
  const radius = RADIUS_SCALE[config.theme.borderRadius] ?? RADIUS_SCALE.md;

  const variables: Record<string, string> = {};
  for (const token of THEME_TOKEN_KEYS) {
    variables[`--ota-${token}`] = palette[token];
  }
  // A single legacy radius (selected by the tenant) plus the fixed design steps
  // from `docs/design.md`.
  variables['--ota-radius'] = radius!;
  variables['--ota-radius-sm'] = RADIUS_SCALE.sm!;
  variables['--ota-radius-md'] = RADIUS_SCALE.md!;
  variables['--ota-radius-lg'] = RADIUS_SCALE.lg!;

  return variables;
}

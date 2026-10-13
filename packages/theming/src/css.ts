import type { TenantConfig } from '@ota/config';

import { contrastRatio, derivePrimaryScale, normalizeHex } from './color';
import {
  DEFAULT_PALETTE,
  FONT_TOKENS,
  ON_PRIMARY_DARK,
  ON_PRIMARY_LIGHT,
  ON_PRIMARY_TOKEN,
  PRIMITIVE_TOKEN_NAMES,
  PRIMITIVE_TOKENS,
  RADIUS_SCALES,
  SCALED_RADIUS_TOKENS,
  THEME_PRESETS,
  type PrimitiveToken,
} from './tokens';

function isPrimitive(name: string): name is PrimitiveToken {
  return Object.prototype.hasOwnProperty.call(PRIMITIVE_TOKENS, name);
}

/**
 * Resolve the tenant's primitive tier: the palette preset, then the brand
 * colour (which derives the primary scale), then the radius scale, then any
 * explicit `theme.tokens` primitive, which wins. Names outside the primitive
 * tier are ignored, because alias and component tokens never change per tenant.
 */
function resolvePrimitives(config: TenantConfig): Record<PrimitiveToken, string> {
  const preset = THEME_PRESETS[config.theme.palette] ?? THEME_PRESETS[DEFAULT_PALETTE]!;
  const primitives: Record<PrimitiveToken, string> = { ...preset.primitives };

  const brand = normalizeHex(config.branding.primaryColor);
  if (brand && brand !== normalizeHex(primitives['color-primary-600'])) {
    const scale = derivePrimaryScale(brand)!;
    primitives['color-primary-700'] = scale[700];
    primitives['color-primary-600'] = scale[600];
    primitives['color-primary-500'] = scale[500];
    primitives['color-primary-100'] = scale[100];
  }

  const factor = RADIUS_SCALES[config.theme.borderRadius] ?? 1;
  if (factor !== 1) {
    for (const name of SCALED_RADIUS_TOKENS) {
      primitives[name] = `${parseFloat(primitives[name]) * factor}px`;
    }
  }

  for (const [name, value] of Object.entries(config.theme.tokens)) {
    if (isPrimitive(name)) {
      primitives[name] = value;
    }
  }

  return primitives;
}

/** White text unless the tenant's primary is light enough that ink reads better. */
function onPrimary(primitives: Record<PrimitiveToken, string>): string {
  const background = primitives['color-primary-600'];
  const light = contrastRatio(primitives['color-neutral-0'], background);
  const dark = contrastRatio(primitives['color-neutral-900'], background);
  return light !== null && dark !== null && dark > light
    ? ON_PRIMARY_DARK
    : ON_PRIMARY_LIGHT;
}

/**
 * Compile a tenant manifest into the CSS custom properties that differ from
 * the core defaults in `@ota/ui/styles.css`; the default tenant compiles to
 * nothing. Apply the result on the root element (`<html>`), never lower: the
 * alias tokens are declared on `:root` and resolve their `var()` references
 * there, so a primitive overridden on a descendant would not reach them.
 * Font families are left to the app's font loader (`FONT_TOKENS`).
 */
export function themeCssVariables(config: TenantConfig): Record<string, string> {
  const primitives = resolvePrimitives(config);
  const variables: Record<string, string> = {};

  for (const name of PRIMITIVE_TOKEN_NAMES) {
    if (FONT_TOKENS.includes(name)) {
      continue;
    }
    if (primitives[name] !== PRIMITIVE_TOKENS[name]) {
      variables[`--${name}`] = primitives[name];
    }
  }

  const textOnPrimary = onPrimary(primitives);
  if (textOnPrimary !== ON_PRIMARY_LIGHT) {
    variables[`--${ON_PRIMARY_TOKEN}`] = textOnPrimary;
  }

  return variables;
}

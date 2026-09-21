/**
 * Colour helpers for turning the tenant manifest's single `primaryColor`
 * (any CSS colour string, but a hex in practice) into the space-separated HSL
 * triple that the design tokens store. Tokens hold `"H S% L%"` so Tailwind can
 * apply opacity with `hsl(var(--ota-primary) / <alpha-value>)`.
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb | null {
  let value = hex.trim().toLowerCase().replace(/^#/, '');
  if (value.length === 3) {
    value = value
      .split('')
      .map((char) => char + char)
      .join('');
  }
  if (!/^[0-9a-f]{6}$/.test(value)) {
    return null;
  }
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

/** Convert a hex colour to an `H S% L%` triple. Returns null for non-hex input. */
export function hexToHslTriple(hex: string): string | null {
  const rgb = parseHex(hex);
  if (!rgb) {
    return null;
  }

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  let hue = 0;
  if (delta !== 0) {
    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(
    lightness * 100,
  )}%`;
}

/**
 * Relative luminance (WCAG) of a hex colour, used to pick a readable foreground
 * over a tenant-supplied brand colour. Returns null for non-hex input.
 */
export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) {
    return null;
  }

  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
}

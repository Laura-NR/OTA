/**
 * Colour helpers for compiling a tenant's brand colour into the primary scale
 * of the design tokens, and for keeping text on it readable.
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
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

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  if (delta !== 0) {
    if (max === red) {
      h = ((green - blue) / delta) % 6;
    } else if (max === green) {
      h = (blue - red) / delta + 2;
    } else {
      h = (red - green) / delta + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  const [r, g, b] =
    h < 60
      ? [chroma, x, 0]
      : h < 120
        ? [x, chroma, 0]
        : h < 180
          ? [0, chroma, x]
          : h < 240
            ? [0, x, chroma]
            : h < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const toHex = (channel: number): string =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Normalise a hex colour to `#RRGGBB` upper case. Returns null for non-hex input. */
export function normalizeHex(hex: string): string | null {
  const rgb = parseHex(hex);
  if (!rgb) {
    return null;
  }
  const toHex = (channel: number): string =>
    channel.toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * Derive the four primary steps from a tenant's single brand colour, which
 * becomes step 600 (actions). The offsets follow the design's own teal scale:
 * 700 is 6 points darker (pressed), 500 7 points lighter (hover), and 100 a
 * desaturated tint at 93 % lightness (selected rows, info surfaces).
 */
export function derivePrimaryScale(
  hex: string,
): { 700: string; 600: string; 500: string; 100: string } | null {
  const rgb = parseHex(hex);
  if (!rgb) {
    return null;
  }
  const base = rgbToHsl(rgb);
  return {
    700: hslToHex({ ...base, l: clamp(base.l - 0.06, 0.04, 0.9) }),
    600: hslToHex(base),
    500: hslToHex({ ...base, l: clamp(base.l + 0.07, 0.08, 0.92) }),
    100: hslToHex({ ...base, s: base.s * 0.5, l: 0.93 }),
  };
}

/**
 * Relative luminance (WCAG) of a hex colour. Returns null for non-hex input.
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

/** WCAG contrast ratio between two hex colours. Returns null for non-hex input. */
export function contrastRatio(foreground: string, background: string): number | null {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  if (a === null || b === null) {
    return null;
  }
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

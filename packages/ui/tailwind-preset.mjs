/**
 * Tailwind preset that maps utilities onto the design tokens (ADR 0006). Apps
 * consume it with `import preset from '@ota/ui/tailwind-preset'`.
 *
 * The tokens are CSS custom properties declared in `styles.css` and overridden
 * per tenant by `@ota/theming`. Utility names follow the token names with the
 * `color-` prefix dropped:
 *
 * - palette steps always carry their number: `bg-primary-600`,
 *   `text-secondary-600`, `border-neutral-200`, `bg-success-100`;
 * - aliases are named for their role on the property they style: `bg-page`,
 *   `bg-surface`, `bg-sunken`, `bg-action-primary` (+ `-hover`, `-active`),
 *   `text-default`, `text-secondary`, `text-muted`, `text-on-primary`, `border`
 *   (default) and `border-input`, `ring-focus`, `outline-focus`. Note that
 *   `text-secondary` is the secondary *text* colour (neutral 700), while
 *   `text-secondary-600` is the terracotta palette step;
 * - type sizes are the type tokens: `text-caption`, `text-overline`,
 *   `text-label` (pills, tabs, badges), `text-body-sm`, `text-nav` (primary
 *   navigation), `text-body`, `text-body-lg`, `text-button`, `text-h4` …
 *   `text-h1`, `text-display-2`, `text-display-1`, and `text-h2-compact` /
 *   `text-h1-compact` for mobile and dense panels (size, line height and the
 *   token's weight). Families are `font-display`, `font-body`, `font-mono`;
 *   the compact headings, like `h1`, take `font-display`.
 *
 * The palette, type scale, radii, shadows and breakpoints replace Tailwind's
 * defaults, so a value outside the design cannot be written by accident.
 * Colours go through `color-mix` so opacity modifiers (`bg-primary-600/10`)
 * keep working on custom properties. Motion and breakpoint values are literal
 * copies of the tokens (a media query cannot read a custom property); type
 * sizes and line heights are the tokens' pixels in rem (16 px = 1 rem), so a
 * reader's browser text size, and the storefront's larger-text preference,
 * scale them. `test/ui.test.ts` holds them to `@ota/theming`.
 *
 * @type {import('tailwindcss').Config}
 */

/** A colour token as a Tailwind colour that accepts an opacity modifier. */
const color = (token) =>
  `color-mix(in srgb, var(--${token}) calc(<alpha-value> * 100%), transparent)`;

const steps = (family, values) =>
  Object.fromEntries(values.map((step) => [step, color(`color-${family}-${step}`)]));

/** A type token's pixels in rem, against the browser's 16 px default. */
const rem = (px) => `${px / 16}rem`;

export const TYPE_SCALE = {
  caption: [rem(12), { lineHeight: rem(16), fontWeight: '500' }],
  overline: [
    rem(12),
    { lineHeight: rem(16), fontWeight: '700', letterSpacing: '0.08em' },
  ],
  label: [rem(13), { lineHeight: rem(16), fontWeight: '600' }],
  'body-sm': [rem(14), { lineHeight: rem(20) }],
  nav: [rem(15), { lineHeight: rem(20), fontWeight: '500' }],
  body: [rem(16), { lineHeight: rem(24) }],
  'body-lg': [rem(18), { lineHeight: rem(28) }],
  button: [rem(16), { lineHeight: rem(24), fontWeight: '600' }],
  h4: [rem(20), { lineHeight: rem(28), fontWeight: '600' }],
  'h2-compact': [rem(22), { lineHeight: rem(28), fontWeight: '600' }],
  h3: [rem(24), { lineHeight: rem(32), fontWeight: '600' }],
  'h1-compact': [rem(28), { lineHeight: rem(34), fontWeight: '600' }],
  h2: [rem(32), { lineHeight: rem(40), fontWeight: '600' }],
  h1: [rem(40), { lineHeight: rem(48), fontWeight: '600' }],
  'display-2': [rem(48), { lineHeight: rem(56), fontWeight: '600' }],
  'display-1': [rem(56), { lineHeight: rem(64), fontWeight: '600' }],
};

const preset = {
  darkMode: ['class'],
  plugins: [
    // A touch screen (DS 02, DS 05): md controls grow to the 44 px target.
    // Named as Tailwind 4 names its built-in variant.
    ({ addVariant }) => addVariant('pointer-coarse', '@media (pointer: coarse)'),
  ],
  theme: {
    // DS 07 breakpoints (`--bp-*`); mobile first, no 2xl.
    screens: { sm: '480px', md: '768px', lg: '1024px', xl: '1280px' },
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      primary: steps('primary', [50, 100, 200, 500, 600, 700]),
      secondary: steps('secondary', [100, 500, 600, 700]),
      accent: steps('accent', [50, 100, 500, 600, 700]),
      neutral: steps('neutral', [0, 50, 100, 200, 300, 500, 600, 700, 900]),
      success: steps('success', [100, 200, 600, 700]),
      warning: steps('warning', [100, 200, 500, 600, 700]),
      error: steps('error', [100, 200, 600, 700]),
      info: steps('info', [100, 200, 600, 700]),
      timeout: steps('timeout', [600]),
    },
    fontFamily: {
      display: ['var(--font-display)'],
      body: ['var(--font-body)'],
      sans: ['var(--font-body)'],
      mono: ['var(--font-mono)'],
    },
    fontSize: TYPE_SCALE,
    borderRadius: {
      none: '0',
      sm: 'var(--radius-sm)',
      DEFAULT: 'var(--radius-md)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      full: 'var(--radius-full)',
    },
    boxShadow: {
      none: 'none',
      sm: 'var(--shadow-sm)',
      DEFAULT: 'var(--shadow-sm)',
      md: 'var(--shadow-md)',
      lg: 'var(--shadow-lg)',
    },
    extend: {
      backgroundColor: {
        page: color('color-bg-page'),
        surface: color('color-bg-surface'),
        sunken: color('color-bg-sunken'),
        'action-primary': {
          DEFAULT: color('color-action-primary'),
          hover: color('color-action-primary-hover'),
          active: color('color-action-primary-active'),
        },
      },
      textColor: {
        default: color('color-text-default'),
        secondary: { DEFAULT: color('color-text-secondary') },
        muted: color('color-text-muted'),
        'on-primary': color('color-text-on-primary'),
      },
      borderColor: {
        DEFAULT: color('color-border'),
        input: color('color-border-input'),
      },
      ringColor: {
        DEFAULT: color('color-focus-ring'),
        focus: color('color-focus-ring'),
      },
      outlineColor: {
        focus: color('color-focus-ring'),
      },
      spacing: {
        touch: 'var(--touch-min)',
        'touch-base': 'var(--touch-base)',
      },
      maxWidth: {
        container: 'var(--container-max)',
      },
      // motion-fast / -base / -slow (DS-Handoff). Reduced motion is honoured
      // globally in styles.css.
      transitionDuration: {
        DEFAULT: '120ms',
        fast: '120ms',
        base: '200ms',
        slow: '320ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'ease-out',
        standard: 'cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
};

export default preset;

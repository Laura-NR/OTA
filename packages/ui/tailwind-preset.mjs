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
 *   `text-body-sm`, `text-body`, `text-body-lg`, `text-button`, `text-h4` …
 *   `text-h1`, `text-display-2`, `text-display-1` (size, line height and the
 *   token's weight); families are `font-display`, `font-body`, `font-mono`.
 *
 * The palette, type scale, radii, shadows and breakpoints replace Tailwind's
 * defaults, so a value outside the design cannot be written by accident.
 * Colours go through `color-mix` so opacity modifiers (`bg-primary-600/10`)
 * keep working on custom properties. Type, motion and breakpoint values are
 * literal copies of the tokens (a media query cannot read a custom property);
 * `test/ui.test.ts` holds them to `@ota/theming`.
 *
 * @type {import('tailwindcss').Config}
 */

/** A colour token as a Tailwind colour that accepts an opacity modifier. */
const color = (token) =>
  `color-mix(in srgb, var(--${token}) calc(<alpha-value> * 100%), transparent)`;

const steps = (family, values) =>
  Object.fromEntries(values.map((step) => [step, color(`color-${family}-${step}`)]));

export const TYPE_SCALE = {
  caption: ['12px', { lineHeight: '16px', fontWeight: '500' }],
  overline: ['12px', { lineHeight: '16px', fontWeight: '700', letterSpacing: '0.08em' }],
  'body-sm': ['14px', { lineHeight: '20px' }],
  body: ['16px', { lineHeight: '24px' }],
  'body-lg': ['18px', { lineHeight: '28px' }],
  button: ['16px', { lineHeight: '24px', fontWeight: '600' }],
  h4: ['20px', { lineHeight: '28px', fontWeight: '600' }],
  h3: ['24px', { lineHeight: '32px', fontWeight: '600' }],
  h2: ['32px', { lineHeight: '40px', fontWeight: '600' }],
  h1: ['40px', { lineHeight: '48px', fontWeight: '600' }],
  'display-2': ['48px', { lineHeight: '56px', fontWeight: '600' }],
  'display-1': ['56px', { lineHeight: '64px', fontWeight: '600' }],
};

const preset = {
  darkMode: ['class'],
  theme: {
    // DS 07 breakpoints; mobile first, no 2xl.
    screens: { sm: '480px', md: '768px', lg: '1024px', xl: '1280px' },
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      primary: steps('primary', [100, 500, 600, 700]),
      secondary: steps('secondary', [100, 500, 600, 700]),
      accent: steps('accent', [100, 500, 600]),
      neutral: steps('neutral', [0, 50, 100, 200, 300, 500, 700, 900]),
      success: steps('success', [100, 600]),
      warning: steps('warning', [100, 600]),
      error: steps('error', [100, 600]),
      info: steps('info', [100, 600]),
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

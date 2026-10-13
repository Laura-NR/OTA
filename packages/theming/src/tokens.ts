/**
 * Design-token contract shared with `packages/ui` (ADR 0006).
 *
 * The names and default values are the Vereda design system's three tiers,
 * exported from the canvas as `design/vereda-v1.1/handoff/tokens.json`:
 * primitive (raw values), alias (semantic names that reference primitives) and
 * component (names bound to a control). Each name is a CSS custom property
 * without its leading `--`.
 *
 * A tenant may override primitives only; alias and component tokens never
 * change per tenant (DS 06), so they always re-resolve against the tenant's
 * primitives.
 */
export const PRIMITIVE_TOKENS = {
  // brand
  'color-primary-700': '#083B50',
  'color-primary-600': '#0B4F6C',
  'color-primary-500': '#0E6B8C',
  'color-primary-100': '#E6F0F4',
  'color-secondary-700': '#7A2A16',
  'color-secondary-600': '#A83E24',
  'color-secondary-500': '#C75B39',
  'color-secondary-100': '#F7E4DC',
  'color-accent-600': '#D99A1F',
  'color-accent-500': '#F2B134',
  'color-accent-100': '#FEF3D6',
  // neutrals (warm)
  'color-neutral-900': '#1F1B17',
  'color-neutral-700': '#4A433D',
  'color-neutral-500': '#6E665E',
  'color-neutral-300': '#D6CEC3',
  'color-neutral-200': '#E8E2D9',
  'color-neutral-100': '#F3EEE6',
  'color-neutral-50': '#FBF8F3',
  'color-neutral-0': '#FFFFFF',
  // semantic fg / bg
  'color-success-600': '#2E7D32',
  'color-success-100': '#E8F5E9',
  'color-warning-600': '#B45309',
  'color-warning-100': '#FEF3C7',
  'color-error-600': '#C62828',
  'color-error-100': '#FDECEA',
  'color-info-600': '#1565C0',
  'color-info-100': '#E3F2FD',
  'color-timeout-600': '#C62828',
  // type
  'font-display': '"Fraunces", Georgia, serif',
  'font-body': '"Inter", system-ui, sans-serif',
  'font-mono': '"IBM Plex Mono", ui-monospace, monospace',
  // space (4px base)
  'space-1': '4px',
  'space-2': '8px',
  'space-3': '12px',
  'space-4': '16px',
  'space-5': '20px',
  'space-6': '24px',
  'space-8': '32px',
  'space-10': '40px',
  'space-12': '48px',
  'space-16': '64px',
  'space-20': '80px',
  // geometry
  'radius-sm': '4px',
  'radius-md': '8px',
  'radius-lg': '12px',
  'radius-full': '9999px',
  'shadow-sm': '0 1px 2px rgba(31,27,23,.08)',
  'shadow-md': '0 4px 12px rgba(31,27,23,.10)',
  'shadow-lg': '0 12px 32px rgba(31,27,23,.16)',
  // motion: the DS-Handoff values. The canvas export carries 0ms, which is the
  // reduced-motion override leaking into the export (change request 01, A1);
  // reduced motion is applied in `packages/ui/styles.css` instead.
  'motion-fast': '120ms ease-out',
  'motion-base': '200ms cubic-bezier(.2,.8,.2,1)',
  'motion-slow': '320ms cubic-bezier(.2,.8,.2,1)',
  // layout
  'container-max': '1280px',
  gutter: '24px',
  'margin-xs': '24px',
  'margin-md': '32px',
  'margin-lg': '40px',
  'touch-min': '44px',
  'touch-base': '48px',
} as const;

export const ALIAS_TOKENS = {
  'color-text-default': 'var(--color-neutral-900)',
  'color-text-secondary': 'var(--color-neutral-700)',
  'color-text-muted': 'var(--color-neutral-500)',
  'color-bg-page': 'var(--color-neutral-50)',
  'color-bg-surface': 'var(--color-neutral-0)',
  'color-bg-sunken': 'var(--color-neutral-100)',
  'color-border': 'var(--color-neutral-200)',
  'color-action-primary': 'var(--color-primary-600)',
  'color-action-primary-hover': 'var(--color-primary-500)',
  'color-action-primary-active': 'var(--color-primary-700)',
  'text-display-1': '600 56px/64px var(--font-display)',
  'text-display-2': '600 48px/56px var(--font-display)',
  'text-h1': '600 40px/48px var(--font-display)',
  'text-h2': '600 32px/40px var(--font-display)',
  'text-h3': '600 24px/32px var(--font-body)',
  'text-h4': '600 20px/28px var(--font-body)',
  'text-body-lg': '400 18px/28px var(--font-body)',
  'text-body': '400 16px/24px var(--font-body)',
  'text-body-sm': '400 14px/20px var(--font-body)',
  'text-caption': '500 12px/16px var(--font-body)',
  'text-overline': '700 12px/16px var(--font-body)',
} as const;

export const COMPONENT_TOKENS = {
  'color-border-input': 'var(--color-neutral-300)',
  'color-focus-ring': 'var(--color-primary-500)',
  'text-button': '600 16px/24px var(--font-body)',
} as const;

/**
 * Build-side addition to the design set (change request 01, A7): the text
 * colour on a primary-filled surface. It binds existing primitives only and is
 * computed from the tenant's primary, so a light brand colour stays readable.
 */
export const ON_PRIMARY_TOKEN = 'color-text-on-primary';
export const ON_PRIMARY_LIGHT = 'var(--color-neutral-0)';
export const ON_PRIMARY_DARK = 'var(--color-neutral-900)';

export type PrimitiveToken = keyof typeof PRIMITIVE_TOKENS;
export type AliasToken = keyof typeof ALIAS_TOKENS;
export type ComponentToken = keyof typeof COMPONENT_TOKENS;
export type ThemePrimitives = Readonly<Record<PrimitiveToken, string>>;

export const PRIMITIVE_TOKEN_NAMES = Object.keys(PRIMITIVE_TOKENS) as PrimitiveToken[];

/**
 * Font families are set by the app's font loader (`next/font/local`), which
 * names the self-hosted faces itself; the theme never emits them, or it would
 * point the families at names no `@font-face` declares.
 */
export const FONT_TOKENS: readonly PrimitiveToken[] = [
  'font-display',
  'font-body',
  'font-mono',
];

/**
 * `theme.borderRadius` scales the three radius steps: `md` is the design
 * (4 / 8 / 12 px), `none` squares everything, `sm` halves and `lg` adds half.
 * `radius-full` (pills) never scales.
 */
export const RADIUS_SCALES: Readonly<Record<string, number>> = {
  none: 0,
  sm: 0.5,
  md: 1,
  lg: 1.5,
};

export const SCALED_RADIUS_TOKENS: readonly PrimitiveToken[] = [
  'radius-sm',
  'radius-md',
  'radius-lg',
];

export interface ThemePreset {
  name: string;
  primitives: ThemePrimitives;
}

/** Keyed as A-Settings names the manifest's `theme.palette` (`islaAbierta`). */
export const THEME_PRESETS: Readonly<Record<string, ThemePreset>> = {
  islaAbierta: { name: 'Isla Abierta', primitives: PRIMITIVE_TOKENS },
};

export const DEFAULT_PALETTE = 'islaAbierta';

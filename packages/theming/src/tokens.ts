/**
 * Design-token contract shared with `packages/ui`.
 *
 * The token names here are the values of the `--ota-*` custom properties that
 * `packages/ui`'s Tailwind preset consumes. Colours are stored as space-
 * separated HSL triples (`"H S% L%"`) so the preset can emit
 * `hsl(var(--ota-primary) / <alpha-value>)` and opacity modifiers work.
 */
export const THEME_TOKEN_KEYS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'success',
  'success-foreground',
  'warning',
  'warning-foreground',
  'timeout',
  'timeout-foreground',
  'border',
  'input',
  'ring',
  'sidebar',
  'sidebar-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
] as const;

export type ThemeToken = (typeof THEME_TOKEN_KEYS)[number];

export type ThemePalette = Readonly<Record<ThemeToken, string>>;

/**
 * Fixed design radii from `docs/design.md` — `radius-sm` 4px, `radius-md` 10px,
 * `radius-lg` 20px. The tenant's `theme.borderRadius` still selects the single
 * legacy `--ota-radius` (used by the bare `rounded` utility); the named steps
 * below always follow the design so components don't drift per fork.
 */
export const RADIUS_SCALE: Readonly<Record<string, string>> = {
  none: '0rem',
  sm: '0.25rem',
  md: '0.625rem',
  lg: '1.25rem',
  full: '9999px',
};

export interface ThemePreset {
  name: string;
  palette: ThemePalette;
}

const ecoGreen: ThemePalette = {
  background: '180 20% 99%',
  foreground: '174 30% 12%',
  card: '0 0% 100%',
  'card-foreground': '174 30% 12%',
  popover: '0 0% 100%',
  'popover-foreground': '174 30% 12%',
  primary: '174 77% 26%',
  'primary-foreground': '0 0% 100%',
  secondary: '172 30% 94%',
  'secondary-foreground': '174 40% 20%',
  muted: '172 25% 95%',
  'muted-foreground': '174 12% 42%',
  accent: '160 45% 90%',
  'accent-foreground': '174 45% 18%',
  destructive: '0 72% 51%',
  'destructive-foreground': '0 0% 100%',
  success: '142 71% 40%',
  'success-foreground': '0 0% 100%',
  warning: '38 92% 50%',
  'warning-foreground': '26 30% 12%',
  timeout: '27 90% 55%',
  'timeout-foreground': '26 30% 12%',
  border: '172 20% 88%',
  input: '172 20% 88%',
  ring: '174 77% 30%',
  sidebar: '174 25% 15%',
  'sidebar-foreground': '172 20% 92%',
  'sidebar-accent': '174 30% 22%',
  'sidebar-accent-foreground': '0 0% 100%',
};

const oceanBlue: ThemePalette = {
  background: '210 30% 99%',
  foreground: '215 35% 14%',
  card: '0 0% 100%',
  'card-foreground': '215 35% 14%',
  popover: '0 0% 100%',
  'popover-foreground': '215 35% 14%',
  primary: '212 85% 42%',
  'primary-foreground': '0 0% 100%',
  secondary: '210 35% 94%',
  'secondary-foreground': '215 40% 22%',
  muted: '210 30% 95%',
  'muted-foreground': '215 12% 44%',
  accent: '205 50% 90%',
  'accent-foreground': '215 45% 20%',
  destructive: '0 72% 51%',
  'destructive-foreground': '0 0% 100%',
  success: '142 71% 40%',
  'success-foreground': '0 0% 100%',
  warning: '38 92% 50%',
  'warning-foreground': '26 30% 12%',
  timeout: '27 90% 55%',
  'timeout-foreground': '26 30% 12%',
  border: '212 24% 88%',
  input: '212 24% 88%',
  ring: '212 85% 46%',
  sidebar: '215 40% 16%',
  'sidebar-foreground': '210 25% 92%',
  'sidebar-accent': '215 35% 24%',
  'sidebar-accent-foreground': '0 0% 100%',
};

const terracotta: ThemePalette = {
  background: '30 35% 99%',
  foreground: '18 30% 14%',
  card: '0 0% 100%',
  'card-foreground': '18 30% 14%',
  popover: '0 0% 100%',
  'popover-foreground': '18 30% 14%',
  primary: '16 70% 45%',
  'primary-foreground': '0 0% 100%',
  secondary: '28 40% 94%',
  'secondary-foreground': '18 40% 22%',
  muted: '30 30% 95%',
  'muted-foreground': '18 12% 44%',
  accent: '24 55% 90%',
  'accent-foreground': '18 45% 20%',
  destructive: '0 72% 51%',
  'destructive-foreground': '0 0% 100%',
  success: '142 71% 40%',
  'success-foreground': '0 0% 100%',
  warning: '38 92% 50%',
  'warning-foreground': '26 30% 12%',
  timeout: '27 90% 55%',
  'timeout-foreground': '26 30% 12%',
  border: '24 25% 88%',
  input: '24 25% 88%',
  ring: '16 70% 48%',
  sidebar: '18 35% 17%',
  'sidebar-foreground': '30 30% 92%',
  'sidebar-accent': '18 30% 25%',
  'sidebar-accent-foreground': '0 0% 100%',
};

const slate: ThemePalette = {
  background: '220 20% 99%',
  foreground: '222 30% 14%',
  card: '0 0% 100%',
  'card-foreground': '222 30% 14%',
  popover: '0 0% 100%',
  'popover-foreground': '222 30% 14%',
  primary: '222 30% 25%',
  'primary-foreground': '0 0% 100%',
  secondary: '220 25% 94%',
  'secondary-foreground': '222 35% 22%',
  muted: '220 22% 95%',
  'muted-foreground': '222 12% 44%',
  accent: '220 25% 90%',
  'accent-foreground': '222 40% 20%',
  destructive: '0 72% 51%',
  'destructive-foreground': '0 0% 100%',
  success: '142 71% 40%',
  'success-foreground': '0 0% 100%',
  warning: '38 92% 50%',
  'warning-foreground': '26 30% 12%',
  timeout: '27 90% 55%',
  'timeout-foreground': '26 30% 12%',
  border: '220 18% 88%',
  input: '220 18% 88%',
  ring: '222 30% 32%',
  sidebar: '222 32% 16%',
  'sidebar-foreground': '220 20% 92%',
  'sidebar-accent': '222 28% 24%',
  'sidebar-accent-foreground': '0 0% 100%',
};

/**
 * The default-tenant palette from `docs/design.md` ("Vereda Expeditions"):
 * Verdín (primary), Tierra Colorada (secondary), Tabaco (accent/warning), Piedra
 * (background), Piedra Clara (surface), Tinta (ink), with distinct amber/red
 * alert tokens. `warning` deliberately reuses Tabaco, and `timeout` is the
 * dispatch Amber Alert, kept separate so the two are distinguishable.
 */
const vereda: ThemePalette = {
  background: '41 35% 89%',
  foreground: '27 18% 12%',
  card: '43 44% 94%',
  'card-foreground': '27 18% 12%',
  popover: '43 44% 94%',
  'popover-foreground': '27 18% 12%',
  primary: '165 37% 27%',
  'primary-foreground': '43 44% 94%',
  secondary: '14 62% 47%',
  'secondary-foreground': '0 0% 100%',
  muted: '41 25% 84%',
  'muted-foreground': '27 15% 34%',
  accent: '36 64% 48%',
  'accent-foreground': '27 18% 12%',
  destructive: '0 51% 46%',
  'destructive-foreground': '0 0% 100%',
  success: '137 43% 21%',
  'success-foreground': '0 0% 100%',
  warning: '36 64% 48%',
  'warning-foreground': '27 18% 12%',
  timeout: '27 71% 51%',
  'timeout-foreground': '27 18% 12%',
  border: '41 25% 78%',
  input: '41 25% 78%',
  ring: '165 37% 32%',
  sidebar: '27 18% 12%',
  'sidebar-foreground': '43 44% 94%',
  'sidebar-accent': '27 18% 24%',
  'sidebar-accent-foreground': '43 44% 94%',
};

export const THEME_PRESETS: Readonly<Record<string, ThemePreset>> = {
  vereda: { name: 'Vereda', palette: vereda },
  ecoGreen: { name: 'Eco Green', palette: ecoGreen },
  oceanBlue: { name: 'Ocean Blue', palette: oceanBlue },
  terracotta: { name: 'Terracotta', palette: terracotta },
  slate: { name: 'Slate', palette: slate },
};

export const DEFAULT_PALETTE = 'ecoGreen';

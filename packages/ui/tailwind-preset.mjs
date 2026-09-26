/**
 * Tailwind preset that maps semantic utility names onto the `--ota-*` design
 * tokens. Apps consume it with `import preset from '@ota/ui/tailwind-preset'`.
 *
 * The token names are the contract with `@ota/theming`, which writes the values
 * (see THEME_TOKEN_KEYS). Colours are HSL triples so opacity modifiers work.
 *
 * @type {import('tailwindcss').Config}
 */
const preset = {
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--ota-border) / <alpha-value>)',
        input: 'hsl(var(--ota-input) / <alpha-value>)',
        ring: 'hsl(var(--ota-ring) / <alpha-value>)',
        background: 'hsl(var(--ota-background) / <alpha-value>)',
        foreground: 'hsl(var(--ota-foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--ota-primary) / <alpha-value>)',
          foreground: 'hsl(var(--ota-primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--ota-secondary) / <alpha-value>)',
          foreground: 'hsl(var(--ota-secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--ota-destructive) / <alpha-value>)',
          foreground: 'hsl(var(--ota-destructive-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--ota-success) / <alpha-value>)',
          foreground: 'hsl(var(--ota-success-foreground) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--ota-warning) / <alpha-value>)',
          foreground: 'hsl(var(--ota-warning-foreground) / <alpha-value>)',
        },
        timeout: {
          DEFAULT: 'hsl(var(--ota-timeout) / <alpha-value>)',
          foreground: 'hsl(var(--ota-timeout-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--ota-muted) / <alpha-value>)',
          foreground: 'hsl(var(--ota-muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--ota-accent) / <alpha-value>)',
          foreground: 'hsl(var(--ota-accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--ota-popover) / <alpha-value>)',
          foreground: 'hsl(var(--ota-popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--ota-card) / <alpha-value>)',
          foreground: 'hsl(var(--ota-card-foreground) / <alpha-value>)',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--ota-sidebar) / <alpha-value>)',
          foreground: 'hsl(var(--ota-sidebar-foreground) / <alpha-value>)',
          accent: {
            DEFAULT: 'hsl(var(--ota-sidebar-accent) / <alpha-value>)',
            foreground: 'hsl(var(--ota-sidebar-accent-foreground) / <alpha-value>)',
          },
        },
      },
      borderRadius: {
        DEFAULT: 'var(--ota-radius)',
        sm: 'var(--ota-radius-sm)',
        md: 'var(--ota-radius-md)',
        lg: 'var(--ota-radius-lg)',
      },
      // `docs/design.md`: two warm-tinted elevation levels only. `ota-1` for
      // interactive/alert surfaces, `ota-2` for modals/hero panels; dense data
      // stays flat with hairline dividers.
      boxShadow: {
        'ota-1': '0 1px 2px 0 rgba(36, 30, 25, 0.08)',
        'ota-2':
          '0 12px 32px -8px rgba(36, 30, 25, 0.16), 0 2px 6px -2px rgba(36, 30, 25, 0.08)',
      },
      fontFamily: {
        sans: ['var(--ota-font-sans, ui-sans-serif)', 'system-ui', 'sans-serif'],
      },
    },
  },
};

export default preset;

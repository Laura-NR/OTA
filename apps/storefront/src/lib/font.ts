import localFont from 'next/font/local';

/**
 * The design system's typefaces (ADR 0006), self-hosted in the fork-specific
 * `tenant/assets/fonts/` so a fork can swap them without touching components.
 * Each loader sets the design token of its family (`--font-display`,
 * `--font-body`, `--font-mono`) on the element that carries `fontVariables`;
 * that must be `<html>`, where the type tokens (`--text-h1` …) resolve. This is
 * a build-time asset path, not a runtime import of agency configuration.
 *
 * None is preloaded: low-bandwidth mode swaps the families for system faces
 * (`globals.css`), and a face no element uses is never downloaded, which a
 * preload would defeat. `display: swap` and the metric-matched fallbacks keep
 * the first paint steady in the default mode.
 */
const fraunces = localFont({
  src: '../../../../tenant/assets/fonts/Fraunces-opsz-wght-latin.woff2',
  variable: '--font-display',
  display: 'swap',
  preload: false,
  weight: '100 900',
  fallback: ['Georgia', 'serif'],
  adjustFontFallback: 'Times New Roman',
});

const inter = localFont({
  src: '../../../../tenant/assets/fonts/Inter-wght-latin.woff2',
  variable: '--font-body',
  display: 'swap',
  preload: false,
  weight: '100 900',
  fallback: ['system-ui', 'sans-serif'],
});

const plexMono = localFont({
  src: [
    {
      path: '../../../../tenant/assets/fonts/IBMPlexMono-400-latin.woff2',
      weight: '400',
    },
    {
      path: '../../../../tenant/assets/fonts/IBMPlexMono-500-latin.woff2',
      weight: '500',
    },
  ],
  variable: '--font-mono',
  display: 'swap',
  preload: false,
  fallback: ['ui-monospace', 'monospace'],
  adjustFontFallback: false,
});

export const fontVariables = `${fraunces.variable} ${inter.variable} ${plexMono.variable}`;

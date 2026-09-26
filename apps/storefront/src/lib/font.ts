import localFont from 'next/font/local';

/**
 * Default design-system typeface (`docs/design.md`): Bricolage Grotesque, one
 * variable file, self-hosted in the fork-specific `tenant/assets/` so a fork can
 * swap it without touching core components. It exposes `--ota-font-sans`, which
 * the `@ota/ui` Tailwind preset reads. This is a build-time asset path, not a
 * runtime import of agency configuration.
 */
export const bricolage = localFont({
  src: '../../../../tenant/assets/fonts/BricolageGrotesque.woff2',
  variable: '--ota-font-sans',
  display: 'swap',
  weight: '200 800',
});

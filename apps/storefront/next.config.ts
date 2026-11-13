import { SUPPORTED_LOCALES } from '@ota/i18n';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

/**
 * The storefront reads public API endpoints through a same-origin `/api/ota`
 * rewrite, so the browser never makes a cross-origin call. API_URL is
 * server-only.
 */
const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Paths renamed for the design's information architecture (Home, DS 07). The
 * old ones redirect, with or without a locale prefix; query strings (the
 * province filter) pass through. Temporary (307) until launch, as in the
 * back-office.
 */
const MOVED: ReadonlyArray<[string, string]> = [
  ['/catalog', '/destinations'],
  ['/build', '/custom'],
  ['/join-our-network', '/join'],
];
const LOCALE = `:locale(${SUPPORTED_LOCALES.join('|')})`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return MOVED.flatMap(([from, to]) => [
      { source: from, destination: to, permanent: false },
      { source: `/${LOCALE}${from}`, destination: `/:locale${to}`, permanent: false },
    ]);
  },
  async rewrites() {
    return [
      { source: '/api/auth/:path*', destination: `${apiUrl}/api/auth/:path*` },
      { source: '/api/ota/:path*', destination: `${apiUrl}/:path*` },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);

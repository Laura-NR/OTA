import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

/**
 * The back-office talks to the API through same-origin rewrites so the browser
 * never makes a cross-origin request: Better Auth session cookies and the OTA
 * endpoints are proxied to the NestJS API. API_URL is server-only.
 */
const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

/**
 * The A-Dashboard information architecture (10 sections) re-homes the pages
 * that predate it; the old paths redirect so bookmarks keep working. Query
 * strings (`?reservation=`) pass through. The escalation and dispatch pages
 * are merged into the dashboard.
 */
const MOVED: ReadonlyArray<[string, string]> = [
  ['/', '/dashboard'],
  ['/escalation', '/dashboard'],
  ['/dispatch', '/dashboard'],
  ['/dashboard/dispatch', '/dashboard'],
  ['/reservations/:path*', '/bookings/:path*'],
  ['/messages', '/bookings/messages'],
  ['/documents', '/bookings/documents'],
  ['/inventory/:path*', '/packages/inventory/:path*'],
  ['/imports', '/packages/imports'],
  ['/applications', '/suppliers/applications'],
  ['/retention', '/customers/retention'],
  ['/customers', '/customers/retention'],
  ['/analytics', '/reports'],
  ['/regulatory', '/reports/regulatory'],
  ['/quality', '/reports/quality'],
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dev-only indicator defaults to the bottom-left corner, where the
  // sidebar's sign-out sits; there it intercepts clicks (and the e2e suite's).
  devIndicators: { position: 'bottom-right' },
  async redirects() {
    return MOVED.map(([source, destination]) => ({
      source,
      destination,
      permanent: false,
    }));
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

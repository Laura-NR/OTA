import type { NextConfig } from 'next';

/**
 * The storefront reads public API endpoints through a same-origin `/api/ota`
 * rewrite, so the browser never makes a cross-origin call. API_URL is
 * server-only.
 */
const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/auth/:path*', destination: `${apiUrl}/api/auth/:path*` },
      { source: '/api/ota/:path*', destination: `${apiUrl}/:path*` },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from 'next';

/**
 * The back-office talks to the API through same-origin rewrites so the browser
 * never makes a cross-origin request: Better Auth session cookies and the OTA
 * endpoints are proxied to the NestJS API. API_URL is server-only.
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

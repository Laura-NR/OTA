'use client';

import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Browser Better Auth client for the storefront. Requests stay same-origin (the
 * `/api/auth` rewrite proxies them to the API), so the default relative base
 * path is correct and no cross-origin cookie handling is needed.
 */
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [magicLinkClient()],
});

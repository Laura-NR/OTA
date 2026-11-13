'use client';

import { passkeyClient } from '@better-auth/passkey/client';
import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Browser Better Auth client. Requests stay same-origin (the `/api/auth`
 * rewrite proxies them to the API), so the default relative base path is
 * correct and no CORS or cross-origin cookie handling is needed. The passkey
 * ceremonies therefore run on the desk's origin, which the API pins
 * (`docs/schema-m9-passkeys.md` P6).
 */
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [magicLinkClient(), passkeyClient()],
});

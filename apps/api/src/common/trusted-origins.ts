import type { IncomingMessage } from 'node:http';

/**
 * The web origins allowed to call the API with a session: Better Auth's
 * callback check and the two Socket.IO gateways. Read on each call, so the
 * gateways (decorated at import) see the `.env` that `main.ts` loads later.
 */
export function trustedOrigins(): string[] {
  return (process.env.TRUSTED_ORIGINS ?? 'http://localhost:3000,http://localhost:3002')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Whether a socket handshake from `origin` may proceed. A browser always
 * names the page's origin on a cross-origin request and on a WebSocket
 * upgrade, which CORS does not cover, so a page elsewhere (another subdomain
 * or port of the same site, whose cookies the browser would send) is refused.
 * A request with no `Origin` is a same-origin poll or a non-browser client,
 * and still needs a session the gateway accepts.
 */
export function socketOriginAllowed(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  const requested = originOf(origin);
  if (requested === null) return false;
  return trustedOrigins().some((trusted) => originOf(trusted) === requested);
}

/** The Socket.IO server options both gateways share (plan F11, B7). */
export const SOCKET_ORIGIN_OPTIONS = {
  cors: {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ): void => callback(null, socketOriginAllowed(origin)),
    credentials: true,
  },
  allowRequest: (
    request: IncomingMessage,
    callback: (error: string | null | undefined, success: boolean) => void,
  ): void => callback(null, socketOriginAllowed(request.headers.origin)),
};

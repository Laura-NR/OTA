/**
 * How a session was created, recorded on `session.signInMethod`
 * (`docs/schema-m9-passkeys.md` P2). Only `passkey` satisfies the staff
 * passkey rule, so any route not listed here records `other` and fails closed.
 */
export type SignInMethod =
  | 'passkey'
  | 'magic_link'
  | 'password'
  | 'oauth'
  | 'recovery_code'
  | 'other';

export function signInMethodForPath(path: string | null | undefined): SignInMethod {
  // Registration can also create a session (`createSession`), but adding a
  // passkey proves only the session it was added from, so it stays `other`.
  if (path === '/passkey/verify-authentication') return 'passkey';
  if (path === '/magic-link/verify') return 'magic_link';
  if (path === '/sign-in/recovery-code') return 'recovery_code';
  if (path === '/sign-in/email' || path === '/sign-up/email') return 'password';
  if (path?.startsWith('/callback/') || path?.startsWith('/oauth2/callback/')) {
    return 'oauth';
  }
  return 'other';
}

export type PasskeyChange = 'register' | 'rename' | 'delete';

/** Better Auth's routes that change a user's passkeys (P4). */
const PASSKEY_CHANGE_PATHS: Readonly<Record<string, PasskeyChange>> = {
  '/passkey/generate-register-options': 'register',
  '/passkey/verify-registration': 'register',
  '/passkey/update-passkey': 'rename',
  '/passkey/delete-passkey': 'delete',
};

export function passkeyChangeForPath(
  path: string | null | undefined,
): PasskeyChange | null {
  return (path && PASSKEY_CHANGE_PATHS[path]) || null;
}

/**
 * Better Auth's routes that a refused session (deactivated, past the staff
 * limit, or idle-locked) may still call: read itself, sign out, and sign in
 * again (`docs/schema-m9-idle-lock.md` L5). Every other route that acts on a
 * session asks the API first, so a locked desk cannot, for instance, add a
 * passkey and unlock itself with it.
 */
const OPEN_TO_REFUSED_SESSION = new Set([
  '/get-session',
  '/sign-out',
  '/ok',
  '/error',
  '/magic-link/verify',
  '/passkey/generate-authenticate-options',
  '/passkey/verify-authentication',
]);

export function routeOpenToRefusedSession(path: string | null | undefined): boolean {
  if (!path) return false;
  return (
    OPEN_TO_REFUSED_SESSION.has(path) ||
    path.startsWith('/sign-in/') ||
    path.startsWith('/sign-up/') ||
    path.startsWith('/callback/') ||
    path.startsWith('/oauth2/callback/')
  );
}

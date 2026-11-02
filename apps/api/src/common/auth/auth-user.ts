import type { PermissionCapability, UserRole } from '@ota/domain';

/**
 * The authenticated principal attached to each request. Populated by the
 * authentication layer; consumed by `@CurrentUser()` and `RolesGuard`.
 */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  /** How the session was created (`session.signInMethod`); `passkey` for a passkey sign-in. */
  signInMethod?: string | null;
  /** The Better Auth session behind the request (the idle lock writes to it). */
  sessionId?: string;
  /** The address the session signed in from (`docs/schema-m9-ip-allowlist.md` I4). */
  signInAddress?: string | null;
  /** Set when the guard let this request through on a permission override (O7). */
  override?: { id: string; capability: PermissionCapability };
}

export interface RequestWithUser {
  user?: AuthUser;
}

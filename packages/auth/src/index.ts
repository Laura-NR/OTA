import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import {
  APIError,
  createAuthMiddleware as createAuthHook,
  getSessionFromCtx,
} from 'better-auth/api';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { magicLink } from 'better-auth/plugins';
import type { IncomingHttpHeaders } from 'node:http';

import {
  passkeyChangeForPath,
  signInMethodForPath,
  type PasskeyChange,
} from './sign-in-method.js';

export {
  passkeyChangeForPath,
  signInMethodForPath,
  type PasskeyChange,
  type SignInMethod,
} from './sign-in-method.js';

export interface SendMagicLinkParams {
  email: string;
  url: string;
  token: string;
}

export interface GoogleProviderConfig {
  clientId: string;
  clientSecret: string;
}

export interface CreateAuthOptions {
  /** A PrismaClient instance. Typed loosely so the generated client type does not leak. */
  prisma: unknown;
  secret: string;
  baseURL: string;
  sendMagicLink: (params: SendMagicLinkParams) => Promise<void>;
  google?: GoogleProviderConfig;
  /** Origins allowed to initiate auth (storefront, back-office). */
  trustedOrigins?: string[];
  /** How long a sign-in link works, in seconds (M9 D9: 600 by default). */
  magicLinkExpiresInSeconds?: number;
  /** The passkey relying party and the staff rule (`docs/schema-m9-passkeys.md`). */
  passkey?: PasskeySettings;
}

export interface PasskeySettings {
  /** The relying party ID every passkey is bound to; the base URL's hostname if unset. */
  rpID?: string;
  /** Shown by the authenticator; the tenant's agency name. */
  rpName?: string;
  /** The origins a ceremony may come from; the request's own Origin if unset. */
  origins?: string[];
  policy?: PasskeyPolicy;
}

/** The API's side of the staff rule for Better Auth's passkey routes (P4). */
export interface PasskeyPolicy {
  /** Why this session may not make this change, or null to let it through. */
  changeRefusal(input: {
    userId: string;
    signInMethod: string | null;
    change: PasskeyChange;
  }): Promise<string | null>;
  /** After a passkey was added or removed: audit and tell the user. */
  changed(input: {
    userId: string;
    change: 'added' | 'removed';
    passkeyId: string;
    name: string | null;
  }): Promise<void>;
}

const USER_NOT_VERIFIED =
  'The passkey did not verify you (PIN or biometric); use one that does';

export interface AuthSessionUser {
  id: string;
  email: string;
  name?: string | null;
  role?: string | null;
  /** M9 D5: set when a Super Admin deactivated the user. */
  deactivatedAt?: Date | null;
}

export interface AuthSession {
  user: AuthSessionUser;
  /**
   * `createdAt` is the sign-in time, which the staff session limit reads (M9
   * D9); `signInMethod` is how the session was created (`SignInMethod`), null
   * for a session from before it was recorded.
   */
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    createdAt?: Date;
    signInMethod?: string | null;
  };
}

/**
 * The narrow surface of a Better Auth instance this platform relies on. Declared
 * explicitly so the generated declaration file stays portable (the instance's
 * inferred type references plugin types that cannot be named in a .d.ts).
 */
export interface AuthInstance {
  api: {
    getSession(input: { headers: Headers }): Promise<AuthSession | null>;
  };
  handler: (request: Request) => Promise<Response>;
}

export type NodeAuthHandler = (
  req: unknown,
  res: unknown,
  next: (error?: unknown) => void,
) => void;

/**
 * Build the Better Auth instance for a tenant.
 *
 * Authentication methods: email + password (always on), magic link, passkeys,
 * and Google OAuth when credentials are supplied. Roles are a server-owned
 * additional field (`input: false`) so a client can never self-assign one.
 * Each session records how it was created, and a passkey must verify the
 * user (PIN or biometric) to register or sign in.
 */
export function createAuth(options: CreateAuthOptions): AuthInstance {
  const passkeySettings = options.passkey ?? {};
  const policy = passkeySettings.policy;
  const instance = betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins,
    database: prismaAdapter(options.prisma as never, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    socialProviders: options.google ? { google: options.google } : undefined,
    // Better Auth addresses a Prisma client as `prisma.user`, `prisma.session`,
    // etc. (Prisma lowercases the model's first letter), so the default model
    // names already match our `User`/`Session`/... models. Only the field
    // mapping and extra user fields need configuring.
    user: {
      fields: {
        name: 'fullName',
      },
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'TRAVELER',
          input: false,
        },
        locale: {
          type: 'string',
          required: false,
          defaultValue: 'es',
        },
        phone: {
          type: 'string',
          required: false,
        },
        // Server-owned (M9 D5): read by the auth guard, never set by a client.
        deactivatedAt: {
          type: 'date',
          required: false,
          input: false,
        },
      },
    },
    session: {
      additionalFields: {
        // Server-owned (docs/schema-m9-passkeys.md P2): set below, never by a client.
        signInMethod: {
          type: 'string',
          required: false,
          input: false,
        },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session, context) => ({
            data: { ...session, signInMethod: signInMethodForPath(context?.path) },
          }),
        },
      },
    },
    hooks: {
      before: createAuthHook(async (ctx) => {
        const change = passkeyChangeForPath(ctx.path);
        if (!change || !policy) return;
        const session = await getSessionFromCtx(ctx);
        // No session: the passkey route itself refuses the call.
        if (!session) return;
        const refusal = await policy.changeRefusal({
          userId: session.user.id,
          signInMethod:
            (session.session as { signInMethod?: string | null }).signInMethod ?? null,
          change,
        });
        if (refusal) {
          throw new APIError('FORBIDDEN', {
            message: refusal,
            code: 'PASSKEY_CHANGE_REFUSED',
          });
        }
      }),
      after: createAuthHook(async (ctx) => {
        if (!policy) return;
        const returned = ctx.context.returned;
        if (!returned || returned instanceof APIError) return;
        if (ctx.path === '/passkey/verify-registration') {
          const added = returned as {
            id?: string;
            userId?: string;
            name?: string | null;
          };
          if (added.id && added.userId) {
            await policy.changed({
              userId: added.userId,
              change: 'added',
              passkeyId: added.id,
              name: added.name ?? null,
            });
          }
        } else if (ctx.path === '/passkey/delete-passkey') {
          const session = await getSessionFromCtx(ctx);
          const passkeyId = (ctx.body as { id?: string } | undefined)?.id;
          if (session && passkeyId) {
            await policy.changed({
              userId: session.user.id,
              change: 'removed',
              passkeyId,
              name: null,
            });
          }
        }
      }),
    },
    plugins: [
      magicLink({
        expiresIn: options.magicLinkExpiresInSeconds ?? 600,
        sendMagicLink: (params) => options.sendMagicLink(params),
      }),
      passkey({
        rpID: passkeySettings.rpID,
        rpName: passkeySettings.rpName,
        origin: passkeySettings.origins?.length ? passkeySettings.origins : undefined,
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        registration: {
          afterVerification: ({ verification }) => {
            if (!verification.registrationInfo?.userVerified) {
              throw new APIError('BAD_REQUEST', { message: USER_NOT_VERIFIED });
            }
          },
        },
        authentication: {
          afterVerification: ({ verification }) => {
            if (!verification.authenticationInfo.userVerified) {
              throw new APIError('UNAUTHORIZED', { message: USER_NOT_VERIFIED });
            }
          },
        },
      }),
    ],
    advanced: {
      database: {
        generateId: () => globalThis.crypto.randomUUID(),
      },
    },
  });

  return instance as unknown as AuthInstance;
}

/** Express/Node handler for `/api/auth/*`, adapted from Better Auth's web handler. */
export function createAuthMiddleware(auth: AuthInstance): NodeAuthHandler {
  return toNodeHandler(auth as never) as unknown as NodeAuthHandler;
}

/** Convert Node incoming headers into the Fetch `Headers` Better Auth expects. */
export function toWebHeaders(headers: IncomingHttpHeaders): Headers {
  return fromNodeHeaders(headers);
}

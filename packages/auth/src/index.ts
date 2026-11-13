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

import { CLIENT_IP_ADDRESS_OPTIONS } from './client-ip.js';
import { recoveryCodePlugin, type RecoveryCodeCheck } from './recovery-code.js';
import { signInDevicePlugin, type SignInDeviceCheck } from './sign-in-device.js';
import { siteBaseURL } from './site-base-url.js';
import {
  workerBearerPlugin,
  workerCodePlugin,
  type WorkerCodeCheck,
} from './worker-code.js';
import {
  passkeyChangeForPath,
  routeOpenToRefusedSession,
  signInMethodForPath,
  type PasskeyChange,
} from './sign-in-method.js';

export { CLIENT_IP_ADDRESS_OPTIONS, CLIENT_IP_HEADER } from './client-ip.js';
export {
  RECOVERY_CODE_INVALID,
  RECOVERY_CODE_SIGN_IN_PATH,
  type RecoveryCodeCheck,
} from './recovery-code.js';
export { DEVICE_COOKIE, type SignInDeviceCheck } from './sign-in-device.js';
export { siteBaseURL, type SiteBaseURL, type SiteBaseURLInput } from './site-base-url.js';
export {
  passkeyChangeForPath,
  routeOpenToRefusedSession,
  signInMethodForPath,
  type PasskeyChange,
  type SignInMethod,
} from './sign-in-method.js';
export {
  BEARER_NOT_ALLOWED,
  WORKER_CODE_INVALID,
  WORKER_CODE_SEND_PATH,
  WORKER_CODE_SIGN_IN_PATH,
  type WorkerCodeCheck,
} from './worker-code.js';

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
  /**
   * Public hosts that each keep their own sessions (`siteBaseURL`); without
   * them every link and cookie is on `baseURL`.
   */
  allowedHosts?: string[];
  sendMagicLink: (params: SendMagicLinkParams) => Promise<void>;
  google?: GoogleProviderConfig;
  /** Origins allowed to initiate auth (storefront, back-office). */
  trustedOrigins?: string[];
  /** How long a sign-in link works, in seconds (M9 D9: 600 by default). */
  magicLinkExpiresInSeconds?: number;
  /** The passkey relying party and the staff rule (`docs/schema-m9-passkeys.md`). */
  passkey?: PasskeySettings;
  /** The API's session rules for Better Auth's own routes (`docs/schema-m9-idle-lock.md` L5). */
  sessionGate?: SessionGate;
  /** Staff recovery codes (`docs/schema-m9-recovery-codes.md`); no route without it. */
  recoveryCode?: RecoveryCodeCheck;
  /** The new-device email (`docs/schema-m9-new-device-email.md`); no device cookie without it. */
  signInDevice?: SignInDeviceCheck;
  /**
   * The worker app's code sign-in and bearer sessions (`docs/worker-app-plan.md`
   * W1, W3); neither route nor bearer token works without it.
   */
  workerCode?: WorkerCodeCheck;
}

/**
 * Asked before a Better Auth route acts on a session, except the routes a
 * refused session may still call (`routeOpenToRefusedSession`).
 */
export interface SessionGate {
  /** Why this session may not act, as an error code and message, or null. */
  refusal(session: AuthSession): Promise<{ code: string; message: string } | null>;
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
    /** The desk's last reported input (`docs/schema-m9-idle-lock.md` L2). */
    lastActiveAt?: Date | null;
    /** Marked at sign-in as the person's own device: no idle lock (L1). */
    ownDevice?: boolean | null;
    /**
     * The address the session signed in from, as the API resolved it
     * (`CLIENT_IP_HEADER`); Better Auth keeps an IPv6 one cut to its /64.
     */
    ipAddress?: string | null;
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
 * user (PIN or biometric) to register or sign in. With a `sessionGate`, a
 * route that acts on a session asks it first, so a refused session (for
 * instance an idle-locked desk) can only read itself, sign out or sign in.
 * With a `recoveryCode` check, a staff member can sign in with a code a Super
 * Admin issued. With a `signInDevice` check, every new session tells the API
 * which browser it came from. A session's address is read only from the
 * header the API writes (`CLIENT_IP_HEADER`). With `allowedHosts`, each site
 * signs in on its own host (`siteBaseURL`). With a `workerCode` check, a
 * worker signs in on the app with a phone number and a code, and the app's
 * bearer token reads that session (and only such a session).
 */
export function createAuth(options: CreateAuthOptions): AuthInstance {
  const passkeySettings = options.passkey ?? {};
  const policy = passkeySettings.policy;
  const gate = options.sessionGate;
  const site = siteBaseURL({
    baseURL: options.baseURL,
    allowedHosts: options.allowedHosts,
  });
  const instance = betterAuth({
    secret: options.secret,
    baseURL: site.baseURL,
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
        // Server-owned (docs/schema-m9-idle-lock.md L1, L2): the API writes them.
        lastActiveAt: {
          type: 'date',
          required: false,
          input: false,
        },
        ownDevice: {
          type: 'boolean',
          required: false,
          defaultValue: false,
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
        const gated = gate !== undefined && !routeOpenToRefusedSession(ctx.path);
        if (!gated && (!change || !policy)) return;
        const session = await getSessionFromCtx(ctx);
        // No session: the route itself refuses or ignores the call.
        if (!session) return;
        if (gated) {
          const refused = await gate.refusal(session as unknown as AuthSession);
          if (refused) {
            throw new APIError('UNAUTHORIZED', {
              message: refused.message,
              code: refused.code,
            });
          }
        }
        if (!change || !policy) return;
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
      ...(options.recoveryCode ? [recoveryCodePlugin(options.recoveryCode)] : []),
      ...(options.signInDevice ? [signInDevicePlugin(options.signInDevice)] : []),
      ...(options.workerCode
        ? [workerCodePlugin(options.workerCode), workerBearerPlugin()]
        : []),
    ],
    advanced: {
      database: {
        generateId: () => globalThis.crypto.randomUUID(),
      },
      ipAddress: CLIENT_IP_ADDRESS_OPTIONS,
      trustedProxyHeaders: site.trustedProxyHeaders,
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

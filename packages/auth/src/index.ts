import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { magicLink } from 'better-auth/plugins';
import type { IncomingHttpHeaders } from 'node:http';

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
}

export interface AuthSessionUser {
  id: string;
  email: string;
  name?: string | null;
  role?: string | null;
}

export interface AuthSession {
  user: AuthSessionUser;
  session: { id: string; userId: string; expiresAt: Date };
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
 */
export function createAuth(options: CreateAuthOptions): AuthInstance {
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
      },
    },
    plugins: [
      magicLink({
        sendMagicLink: (params) => options.sendMagicLink(params),
      }),
      passkey(),
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

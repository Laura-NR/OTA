import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  type AuthMiddleware,
} from 'better-auth/api';
import { constantTimeEqual, makeSignature } from 'better-auth/crypto';
import { bearer } from 'better-auth/plugins';

/** Where the worker app asks for a code by SMS (`docs/worker-app-plan.md` W1). */
export const WORKER_CODE_SEND_PATH = '/sign-in/worker-code/send';

/** Where the worker app signs in with a phone number and a code. */
export const WORKER_CODE_SIGN_IN_PATH = '/sign-in/worker-code';

/** The one answer to every refused code, so the route reveals nothing. */
export const WORKER_CODE_INVALID = 'This code is not valid; ask for a new one';

/** The answer to a bearer token from a session the worker app did not open (W3). */
export const BEARER_NOT_ALLOWED = 'Only the worker app may send a session token';

/** The sign-in method a bearer session must have (`signInMethodForPath`). */
const WORKER_SIGN_IN_METHOD = 'worker_code';

/** The API's side of a worker-code sign-in. */
export interface WorkerCodeCheck {
  /**
   * Send a code by SMS to the worker with this number, when there is exactly
   * one and the last code went long enough ago. Says nothing either way.
   */
  send(input: { phone: string }): Promise<void>;
  /**
   * The worker this number and code sign in, with when their session ends,
   * or null. The API records the use, or the wrong try, before it answers.
   */
  redeem(input: { phone: string; code: string }): Promise<{
    userId: string;
    expiresAt: Date;
  } | null>;
}

const MAX_PHONE = 32;
const MAX_CODE = 16;

function invalid(): APIError {
  return new APIError('UNAUTHORIZED', {
    message: WORKER_CODE_INVALID,
    code: 'WORKER_CODE_INVALID',
  });
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' && value.length <= max ? value.trim() : '';
}

/**
 * `POST /sign-in/worker-code/send` `{ phone }` asks the API to text a code
 * and always answers `{ status: true }`. `POST /sign-in/worker-code`
 * `{ phone, code }` asks the API whether the code is open for that number,
 * then creates the worker's session, ending when the API says, and answers
 * with its signed token for the app to send as a bearer token. No cookie is
 * set: the app is not a browser. The session records `worker_code`
 * (`signInMethodForPath`).
 */
export function workerCodePlugin(check: WorkerCodeCheck) {
  return {
    id: 'worker-code',
    endpoints: {
      sendWorkerCode: createAuthEndpoint(
        WORKER_CODE_SEND_PATH,
        { method: 'POST' },
        async (ctx) => {
          const phone = text(
            (ctx.body as { phone?: unknown } | undefined)?.phone,
            MAX_PHONE,
          );
          if (phone) await check.send({ phone });
          return ctx.json({ status: true });
        },
      ),
      signInWorkerCode: createAuthEndpoint(
        WORKER_CODE_SIGN_IN_PATH,
        { method: 'POST' },
        async (ctx) => {
          const body = (ctx.body ?? {}) as { phone?: unknown; code?: unknown };
          const phone = text(body.phone, MAX_PHONE);
          const code = text(body.code, MAX_CODE);
          if (!phone || !code) throw invalid();
          const redeemed = await check.redeem({ phone, code });
          if (!redeemed) throw invalid();
          const user = await ctx.context.internalAdapter.findUserById(redeemed.userId);
          if (!user) throw invalid();
          const session = await ctx.context.internalAdapter.createSession(
            redeemed.userId,
            false,
            { expiresAt: redeemed.expiresAt },
            true,
          );
          if (!session) {
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message: 'The session could not be created',
            });
          }
          const signature = await makeSignature(session.token, ctx.context.secret);
          return ctx.json({
            token: encodeURIComponent(`${session.token}.${signature}`),
            expiresAt: session.expiresAt,
          });
        },
      ),
    },
  };
}

function bearerToken(headers: Headers | undefined): string | null {
  const header = headers?.get('authorization');
  if (!header || header.slice(0, 7).toLowerCase() !== 'bearer ') return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  try {
    return decodeURIComponent(token);
  } catch {
    return token;
  }
}

/**
 * Better Auth's bearer conversion, narrowed for the worker app (W3): only
 * `getSession` reads `Authorization: Bearer <signed token>`, so no other
 * Better Auth route acts on a bearer session, and a correctly signed token
 * from a session the worker code did not open is refused rather than used.
 * Only the request side is taken from the stock plugin: its response side
 * would expose every new session's token in a header, staff ones included.
 */
export function workerBearerPlugin() {
  const [convert] = bearer({ requireSignature: true }).hooks.before;
  if (!convert) throw new Error('Better Auth bearer plugin has no request hook');
  const matcher = (context: Parameters<typeof convert.matcher>[0]) =>
    context.path === '/get-session' && convert.matcher(context);
  const onlyWorkerSessions: AuthMiddleware = createAuthMiddleware(async (ctx) => {
    const signed = bearerToken(ctx.request?.headers ?? ctx.headers);
    if (!signed) return;
    const [token, signature] = signed.split('.');
    if (!token || !signature) return;
    const expected = await makeSignature(token, ctx.context.secret);
    // A wrong signature is left to the conversion, which ignores the header.
    if (!constantTimeEqual(expected, signature)) return;
    const found = await ctx.context.internalAdapter.findSession(token);
    const method = (found?.session as { signInMethod?: string | null } | undefined)
      ?.signInMethod;
    if (found && method !== WORKER_SIGN_IN_METHOD) {
      throw new APIError('UNAUTHORIZED', {
        message: BEARER_NOT_ALLOWED,
        code: 'BEARER_NOT_ALLOWED',
      });
    }
  });
  return {
    id: 'worker-bearer',
    hooks: {
      before: [
        { matcher, handler: onlyWorkerSessions },
        { matcher, handler: convert.handler },
      ],
    },
  };
}

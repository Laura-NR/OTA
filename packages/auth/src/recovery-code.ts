import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';

/** Where a staff member types a recovery code (`docs/schema-m9-recovery-codes.md`). */
export const RECOVERY_CODE_SIGN_IN_PATH = '/sign-in/recovery-code';

/** The one answer to every refused code, so the route reveals nothing (R4). */
export const RECOVERY_CODE_INVALID =
  'This code is not valid; ask a Super Admin for a new one';

/** The API's side of a recovery sign-in. */
export interface RecoveryCodeCheck {
  /**
   * The id of the staff member this email and code sign in, or null. The API
   * records the use, or the wrong try, before it answers.
   */
  redeem(input: { email: string; code: string }): Promise<string | null>;
}

const MAX_EMAIL = 320;
const MAX_CODE = 64;

function invalid(): APIError {
  return new APIError('UNAUTHORIZED', {
    message: RECOVERY_CODE_INVALID,
    code: 'RECOVERY_CODE_INVALID',
  });
}

/**
 * `POST /sign-in/recovery-code` `{ email, code }`: asks the API whether the
 * code is open for that person, then creates their session and sets its
 * cookie as Better Auth's own sign-ins do. The session records
 * `recovery_code` (`signInMethodForPath`), which the API holds to passkey
 * setup.
 */
export function recoveryCodePlugin(check: RecoveryCodeCheck) {
  return {
    id: 'staff-recovery-code',
    endpoints: {
      signInRecoveryCode: createAuthEndpoint(
        RECOVERY_CODE_SIGN_IN_PATH,
        { method: 'POST' },
        async (ctx) => {
          const body = (ctx.body ?? {}) as { email?: unknown; code?: unknown };
          const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
          const code = typeof body.code === 'string' ? body.code : '';
          if (!email || !code || email.length > MAX_EMAIL || code.length > MAX_CODE) {
            throw invalid();
          }
          const userId = await check.redeem({ email, code });
          if (!userId) throw invalid();
          const user = await ctx.context.internalAdapter.findUserById(userId);
          if (!user) throw invalid();
          const session = await ctx.context.internalAdapter.createSession(userId);
          if (!session) {
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message: 'The session could not be created',
            });
          }
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ status: true });
        },
      ),
    },
  };
}

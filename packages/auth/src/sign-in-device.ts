import { createAuthMiddleware } from 'better-auth/api';

/** The browser's device cookie (`docs/schema-m9-new-device-email.md` N1). */
export const DEVICE_COOKIE = 'ota_device';

/** About the longest a browser keeps a cookie; renewed at each staff sign-in. */
const DEVICE_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** The API's side of the new-device email. */
export interface SignInDeviceCheck {
  /**
   * After a route created a session: record the browser and, when it is new,
   * email the person. Returns the device cookie to set (a fresh value for a
   * new device), or null to leave the cookie alone (not staff).
   */
  signedIn(input: {
    userId: string;
    /** The request's `ota_device` cookie, when it sent one. */
    deviceToken: string | null;
    userAgent: string | null;
    ipAddress: string | null;
    signInMethod: string | null;
  }): Promise<string | null>;
}

/**
 * Asks the API about every session a route creates (sign-in link, passkey,
 * recovery code, password) and sets the device cookie it returns. Better Auth
 * runs this after the route, also when the route answers with a redirect, so
 * the cookie reaches the browser either way. A failure is logged and never
 * fails the sign-in.
 */
export function signInDevicePlugin(check: SignInDeviceCheck) {
  return {
    id: 'staff-sign-in-device',
    hooks: {
      after: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            const created = ctx.context.newSession;
            if (!created) return;
            const session = created.session as typeof created.session & {
              signInMethod?: string | null;
            };
            try {
              const token = await check.signedIn({
                userId: created.user.id,
                deviceToken: ctx.getCookie(DEVICE_COOKIE) ?? null,
                userAgent: session.userAgent ?? null,
                ipAddress: session.ipAddress ?? null,
                signInMethod: session.signInMethod ?? null,
              });
              if (token) {
                ctx.setCookie(DEVICE_COOKIE, token, {
                  httpOnly: true,
                  sameSite: 'lax',
                  path: '/',
                  secure: ctx.context.authCookies.sessionToken.attributes.secure,
                  maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
                });
              }
            } catch (error) {
              ctx.context.logger.error('The sign-in device was not recorded', error);
            }
          }),
        },
      ],
    },
  };
}

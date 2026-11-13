import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { magicLink } from 'better-auth/plugins';
import { describe, expect, it } from 'vitest';

import {
  DEVICE_COOKIE,
  signInDevicePlugin,
  type SignInDeviceCheck,
} from '../src/sign-in-device';

const BASE = 'http://localhost:3001';
const NOW = new Date('2026-11-01T10:00:00Z');

type SignedIn = Parameters<SignInDeviceCheck['signedIn']>[0];

function setup(answer: (input: SignedIn) => Promise<string | null>) {
  const db = {
    user: [
      {
        id: 'staff-1',
        email: 'ana@example.test',
        name: 'Ana',
        emailVerified: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    session: [] as Array<Record<string, unknown>>,
    account: [],
    verification: [] as Array<Record<string, unknown>>,
  };
  const calls: SignedIn[] = [];
  const links: string[] = [];
  const auth = betterAuth({
    secret: 'sign-in-device-test-secret-at-least-32-chars',
    baseURL: BASE,
    database: memoryAdapter(db),
    plugins: [
      magicLink({ sendMagicLink: async ({ url }) => void links.push(url) }),
      signInDevicePlugin({
        signedIn: async (input) => {
          calls.push(input);
          return answer(input);
        },
      }),
    ],
  });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    auth.handler(
      new Request(`${BASE}/api/auth${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: BASE,
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Firefox/133.0',
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );
  const signInByLink = async (headers: Record<string, string> = {}) => {
    await post('/sign-in/magic-link', { email: 'ana@example.test' });
    const url = links.at(-1)!;
    return auth.handler(new Request(url, { headers: { origin: BASE, ...headers } }));
  };
  return { db, calls, signInByLink, post };
}

describe('the sign-in device (docs/schema-m9-new-device-email.md N1)', () => {
  it('asks the API about a new session and sets the cookie it returns, on a redirect too', async () => {
    const { calls, signInByLink } = setup(async () => 'fresh-device-token');
    const response = await signInByLink({ cookie: `${DEVICE_COOKIE}=old-token` });
    expect(response.status).toBe(302);
    const cookies = response.headers.getSetCookie();
    expect(
      cookies.some((cookie) => cookie.startsWith('better-auth.session_token=')),
    ).toBe(true);
    const device = cookies.find((cookie) => cookie.startsWith(`${DEVICE_COOKIE}=`));
    expect(device).toContain(`${DEVICE_COOKIE}=fresh-device-token`);
    expect(device).toMatch(/HttpOnly/i);
    expect(device).toMatch(/SameSite=Lax/i);
    expect(device).toMatch(/Max-Age=34560000/);
    expect(calls).toEqual([
      expect.objectContaining({ userId: 'staff-1', deviceToken: 'old-token' }),
    ]);
  });

  it('leaves the cookie alone when the API returns nothing', async () => {
    const { calls, signInByLink } = setup(async () => null);
    const response = await signInByLink();
    expect(response.status).toBe(302);
    expect(
      response.headers.getSetCookie().some((cookie) => cookie.startsWith(DEVICE_COOKIE)),
    ).toBe(false);
    expect(calls).toEqual([expect.objectContaining({ deviceToken: null })]);
  });

  it('never fails the sign-in when the API throws', async () => {
    const { db, signInByLink } = setup(async () => {
      throw new Error('database down');
    });
    const response = await signInByLink();
    expect(response.status).toBe(302);
    expect(db.session).toHaveLength(1);
  });

  it('is not asked by routes that create no session', async () => {
    const { calls, post } = setup(async () => 'token');
    const response = await post('/sign-in/magic-link', { email: 'ana@example.test' });
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(0);
  });
});

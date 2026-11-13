import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';

import { signInMethodForPath } from '../src/sign-in-method';
import {
  BEARER_NOT_ALLOWED,
  WORKER_CODE_INVALID,
  workerBearerPlugin,
  workerCodePlugin,
  type WorkerCodeCheck,
} from '../src/worker-code';

const BASE = 'http://localhost:3001';
const NOW = new Date('2026-11-09T10:00:00Z');
const THIRTY_DAYS = new Date(Date.now() + 30 * 24 * 60 * 60_000);

function setup(redeem: WorkerCodeCheck['redeem']) {
  const db = {
    user: [
      {
        id: 'worker-1',
        email: 'driver@example.test',
        name: 'Reinier',
        emailVerified: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    session: [] as Array<Record<string, unknown>>,
    account: [] as Array<Record<string, unknown>>,
    verification: [],
  };
  const sent: Array<{ phone: string }> = [];
  const redeemed: Array<{ phone: string; code: string }> = [];
  // As `createAuth` does: each session records the route that created it.
  const auth = betterAuth({
    secret: 'worker-code-test-secret-at-least-32-chars',
    baseURL: BASE,
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    session: {
      additionalFields: {
        signInMethod: { type: 'string', required: false, input: false },
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
    plugins: [
      workerCodePlugin({
        send: async (input) => {
          sent.push(input);
        },
        redeem: async (input) => {
          redeemed.push(input);
          return redeem(input);
        },
      }),
      workerBearerPlugin(),
    ],
  });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    auth.handler(
      new Request(`${BASE}/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE, ...headers },
        body: JSON.stringify(body),
      }),
    );
  const sessionFor = (authorization: string) =>
    auth.api.getSession({ headers: new Headers({ authorization }) });
  return { auth, db, sent, redeemed, post, sessionFor };
}

const opens = async () => ({ userId: 'worker-1', expiresAt: THIRTY_DAYS });

describe('the worker-code sign-in (docs/worker-app-plan.md W1)', () => {
  it('asks the API to text a code and answers alike whatever it finds', async () => {
    const { sent, post } = setup(opens);
    const response = await post('/sign-in/worker-code/send', { phone: ' 5 241 0088 ' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: true });
    expect(sent).toEqual([{ phone: '5 241 0088' }]);
    expect((await post('/sign-in/worker-code/send', { phone: 42 })).status).toBe(200);
    expect(sent).toHaveLength(1);
  });

  it('opens a worker_code session that ends when the API says, with no cookie', async () => {
    const { db, redeemed, post } = setup(opens);
    const response = await post('/sign-in/worker-code', {
      phone: '52410088',
      code: '123 456',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
    const body = (await response.json()) as { token: string; expiresAt: string };
    expect(body.token).toContain('.');
    expect(new Date(body.expiresAt)).toEqual(THIRTY_DAYS);
    expect(db.session).toHaveLength(1);
    expect(db.session[0]).toMatchObject({
      userId: 'worker-1',
      signInMethod: 'worker_code',
      expiresAt: THIRTY_DAYS,
    });
    expect(redeemed).toEqual([{ phone: '52410088', code: '123 456' }]);
  });

  it('answers every refusal alike and opens no session', async () => {
    const { db, post } = setup(async () => null);
    const response = await post('/sign-in/worker-code', {
      phone: '52410088',
      code: '000000',
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'WORKER_CODE_INVALID',
      message: WORKER_CODE_INVALID,
    });
    expect(db.session).toHaveLength(0);
  });

  it('refuses a missing or oversized body without asking the API', async () => {
    const { redeemed, post } = setup(opens);
    for (const body of [
      {},
      { phone: '52410088' },
      { phone: 52410088, code: '123456' },
      { phone: '5'.repeat(33), code: '123456' },
    ]) {
      expect((await post('/sign-in/worker-code', body)).status).toBe(401);
    }
    expect(redeemed).toHaveLength(0);
  });
});

describe('the worker app bearer token (W3)', () => {
  it('reads the worker session it was issued for', async () => {
    const { post, sessionFor } = setup(opens);
    const { token } = (await (
      await post('/sign-in/worker-code', { phone: '52410088', code: '123456' })
    ).json()) as { token: string };
    const session = await sessionFor(`Bearer ${token}`);
    expect(session?.user.id).toBe('worker-1');
  });

  it('refuses a correctly signed token from any other sign-in', async () => {
    const { auth, post, sessionFor } = setup(opens);
    const signUp = await post('/sign-up/email', {
      email: 'ana@example.test',
      password: 'a-long-enough-password',
      name: 'Ana',
    });
    expect(signUp.status).toBe(200);
    // The stock plugin's response side is not installed: no token header.
    expect(signUp.headers.get('set-auth-token')).toBeNull();
    const cookie = signUp.headers.get('set-cookie') ?? '';
    const signed = /better-auth\.session_token=([^;]+)/.exec(cookie)?.[1];
    expect(signed).toBeTruthy();
    await expect(sessionFor(`Bearer ${signed}`)).rejects.toMatchObject({
      body: { code: 'BEARER_NOT_ALLOWED', message: BEARER_NOT_ALLOWED },
    });
    // The same session still works as the browser's cookie.
    const asCookie = await auth.api.getSession({
      headers: new Headers({ cookie: `better-auth.session_token=${signed}` }),
    });
    expect(asCookie?.user.email).toBe('ana@example.test');
  });

  it('ignores an unsigned or wrongly signed token', async () => {
    const { db, post, sessionFor } = setup(opens);
    const { token } = (await (
      await post('/sign-in/worker-code', { phone: '52410088', code: '123456' })
    ).json()) as { token: string };
    const raw = String(db.session[0]?.token);
    expect(await sessionFor(`Bearer ${raw}`)).toBeNull();
    expect(await sessionFor(`Bearer ${raw}.${'A'.repeat(43)}=`)).toBeNull();
    expect(await sessionFor(`Bearer ${token}`)).not.toBeNull();
  });

  it('is read only by getSession, not by any other route', async () => {
    const { auth, post } = setup(opens);
    const { token } = (await (
      await post('/sign-in/worker-code', { phone: '52410088', code: '123456' })
    ).json()) as { token: string };
    const listed = await auth.handler(
      new Request(`${BASE}/api/auth/list-sessions`, {
        headers: { authorization: `Bearer ${token}`, origin: BASE },
      }),
    );
    expect(listed.status).toBe(401);
  });
});

import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';

import {
  RECOVERY_CODE_INVALID,
  recoveryCodePlugin,
  type RecoveryCodeCheck,
} from '../src/recovery-code';

const BASE = 'http://localhost:3001';
const NOW = new Date('2026-11-01T10:00:00Z');

function setup(redeem: RecoveryCodeCheck['redeem']) {
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
    verification: [],
  };
  const calls: Array<{ email: string; code: string }> = [];
  const auth = betterAuth({
    secret: 'recovery-code-test-secret-at-least-32-chars',
    baseURL: BASE,
    database: memoryAdapter(db),
    plugins: [
      recoveryCodePlugin({
        redeem: async (input) => {
          calls.push(input);
          return redeem(input);
        },
      }),
    ],
  });
  const signIn = (body: unknown) =>
    auth.handler(
      new Request(`${BASE}/api/auth/sign-in/recovery-code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE },
        body: JSON.stringify(body),
      }),
    );
  return { db, calls, signIn };
}

describe('the recovery-code sign-in (docs/schema-m9-recovery-codes.md R3, R4)', () => {
  it('creates the session the API names and sets its cookie', async () => {
    const { db, calls, signIn } = setup(async () => 'staff-1');
    const response = await signIn({
      email: ' Ana@Example.test ',
      code: 'ABCD-2345-WXYZ',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('better-auth.session_token=');
    expect(db.session).toHaveLength(1);
    expect(db.session[0]?.userId).toBe('staff-1');
    // The API gets the email as stored (trimmed, lower case) and the code as typed.
    expect(calls).toEqual([{ email: 'ana@example.test', code: 'ABCD-2345-WXYZ' }]);
  });

  it('answers every refusal alike and creates no session', async () => {
    const { db, signIn } = setup(async () => null);
    const response = await signIn({ email: 'ana@example.test', code: 'WRONG-CODE' });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'RECOVERY_CODE_INVALID',
      message: RECOVERY_CODE_INVALID,
    });
    expect(db.session).toHaveLength(0);
  });

  it('refuses a missing or oversized body without asking the API', async () => {
    const { calls, signIn } = setup(async () => 'staff-1');
    for (const body of [
      {},
      { email: 'ana@example.test' },
      { email: 42, code: 'ABCD-2345-WXYZ' },
      { email: 'ana@example.test', code: 'x'.repeat(65) },
    ]) {
      expect((await signIn(body)).status).toBe(401);
    }
    expect(calls).toHaveLength(0);
  });

  it('refuses a user the API names who no longer exists', async () => {
    const { db, signIn } = setup(async () => 'gone');
    expect((await signIn({ email: 'x@example.test', code: 'ABCD2345WXYZ' })).status).toBe(
      401,
    );
    expect(db.session).toHaveLength(0);
  });
});

import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';

import { CLIENT_IP_ADDRESS_OPTIONS, CLIENT_IP_HEADER } from '../src/client-ip';

const BASE = 'http://localhost:3001';

function setup() {
  const db = {
    user: [] as Array<Record<string, unknown>>,
    session: [] as Array<Record<string, unknown>>,
    account: [] as Array<Record<string, unknown>>,
    verification: [] as Array<Record<string, unknown>>,
  };
  const auth = betterAuth({
    secret: 'client-ip-test-secret-at-least-32-characters',
    baseURL: BASE,
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    advanced: { ipAddress: CLIENT_IP_ADDRESS_OPTIONS },
  });
  const signUp = (headers: Record<string, string>) =>
    auth.handler(
      new Request(`${BASE}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE, ...headers },
        body: JSON.stringify({
          email: `ip-${db.user.length}@example.test`,
          password: 'a long enough password',
          name: 'Ana',
        }),
      }),
    );
  return { db, signUp };
}

describe("a session's address (docs/schema-m9-ip-allowlist.md I2)", () => {
  it('comes from the header the API writes', async () => {
    const { db, signUp } = setup();
    const response = await signUp({ [CLIENT_IP_HEADER]: '203.0.113.9' });
    expect(response.status).toBe(200);
    expect(db.session.at(-1)?.ipAddress).toBe('203.0.113.9');
  });

  it('never from an X-Forwarded-For the client wrote', async () => {
    const { db, signUp } = setup();
    await signUp({
      'x-forwarded-for': '203.0.113.9',
      [CLIENT_IP_HEADER]: '198.51.100.7',
    });
    expect(db.session.at(-1)?.ipAddress).toBe('198.51.100.7');
    await signUp({ 'x-forwarded-for': '203.0.113.9' });
    expect(db.session.at(-1)?.ipAddress).not.toBe('203.0.113.9');
  });

  it('keeps an IPv6 address cut to its /64, as the allowlist expects', async () => {
    const { db, signUp } = setup();
    await signUp({ [CLIENT_IP_HEADER]: '2001:db8:4:1:aaaa:bbbb:cccc:dddd' });
    expect(db.session.at(-1)?.ipAddress).toBe('2001:0db8:0004:0001:0000:0000:0000:0000');
  });
});

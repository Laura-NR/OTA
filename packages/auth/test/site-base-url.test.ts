import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { magicLink } from 'better-auth/plugins';
import { describe, expect, it } from 'vitest';

import { siteBaseURL, type SiteBaseURLInput } from '../src/site-base-url';

const STOREFRONT = 'veredaexpeditions.com';
const DESK = 'desk.veredaexpeditions.com';
// Behind Caddy and a Next rewrite the API is reached on its internal name.
const API = 'http://api:3001';

function setup(input: SiteBaseURLInput) {
  const site = siteBaseURL(input);
  const links: string[] = [];
  const auth = betterAuth({
    secret: 'site-base-url-test-secret-at-least-32-chars',
    baseURL: site.baseURL,
    trustedOrigins: [`https://${STOREFRONT}`, `https://${DESK}`],
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    plugins: [
      magicLink({
        sendMagicLink: async ({ url }) => {
          links.push(url);
        },
      }),
    ],
    advanced: { trustedProxyHeaders: site.trustedProxyHeaders },
  });

  // What a Next rewrite sends on: Host is the API, X-Forwarded-Host the site.
  const viaSite = (path: string, host: string, init: RequestInit = {}) =>
    auth.handler(
      new Request(`${API}/api/auth${path}`, {
        ...init,
        headers: {
          'x-forwarded-host': host,
          'x-forwarded-proto': 'http',
          origin: `https://${host}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      }),
    );

  const requestLink = async (host: string) => {
    const response = await viaSite('/sign-in/magic-link', host, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ana@example.test', callbackURL: '/' }),
    });
    expect(response.status).toBe(200);
    return new URL(links.at(-1) as string);
  };

  return { auth, viaSite, requestLink };
}

describe('a sign-in per site (deployment plan D7(a), B6)', () => {
  const perSite = {
    baseURL: `https://${STOREFRONT}`,
    allowedHosts: [STOREFRONT, DESK],
  };

  it('builds a link asked for on the desk on the desk, and one from the storefront there', async () => {
    const { requestLink } = setup(perSite);

    const desk = await requestLink(DESK);
    expect(desk.origin).toBe(`https://${DESK}`);
    expect(desk.pathname).toBe('/api/auth/magic-link/verify');

    const storefront = await requestLink(STOREFRONT);
    expect(storefront.origin).toBe(`https://${STOREFRONT}`);
  });

  it('sets the desk session cookie on the desk host only, and reads it back there', async () => {
    const { auth, viaSite, requestLink } = setup(perSite);
    const link = await requestLink(DESK);

    const verified = await viaSite(`/magic-link/verify${link.search}`, DESK);
    expect(verified.status).toBe(302);
    expect(
      new URL(verified.headers.get('location') as string, `https://${DESK}`).origin,
    ).toBe(`https://${DESK}`);
    const cookie = verified.headers
      .getSetCookie()
      .find((line) => line.startsWith('__Secure-better-auth.session_token='));
    expect(cookie).toBeDefined();
    // Host-only: no Domain attribute, so the storefront never receives it.
    expect(cookie).not.toMatch(/;\s*domain=/i);
    expect(cookie).toMatch(/;\s*secure/i);

    const session = await auth.api.getSession({
      headers: new Headers({
        host: 'api:3001',
        'x-forwarded-host': DESK,
        cookie: (cookie as string).split(';')[0],
      }),
    });
    expect(session?.user.email).toBe('ana@example.test');
  });

  it('answers a host outside the list on BETTER_AUTH_URL', async () => {
    const { requestLink } = setup(perSite);
    expect((await requestLink('evil.example.test')).origin).toBe(`https://${STOREFRONT}`);
  });

  it('keeps every link on BETTER_AUTH_URL without allowed hosts, as in dev', async () => {
    const { requestLink } = setup({
      baseURL: 'http://localhost:3001',
      allowedHosts: [' ', ''],
    });
    expect((await requestLink(DESK)).origin).toBe('http://localhost:3001');
  });

  it('takes the scheme from BETTER_AUTH_URL, not from the proxied request', () => {
    expect(
      siteBaseURL({ baseURL: 'http://localhost:3001', allowedHosts: ['localhost:3002'] }),
    ).toEqual({
      baseURL: {
        allowedHosts: ['localhost:3002'],
        protocol: 'http',
        fallback: 'http://localhost:3001',
      },
      trustedProxyHeaders: true,
    });
    expect(
      siteBaseURL({ baseURL: `https://${STOREFRONT}`, allowedHosts: [DESK] }).baseURL,
    ).toMatchObject({ protocol: 'https' });
  });
});

import AxeBuilder from '@axe-core/playwright';
import { PrismaClient } from '@ota/db';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import { signIn } from './helpers';

const BACKOFFICE = 'http://localhost:3002';
const OPS = 'idle-e2e-ops@example.test';
const OWN = 'idle-e2e-own@example.test';
const EMAILS = [OPS, OWN];
const MINUTE = 60_000;
const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

/**
 * docs/schema-m9-idle-lock.md, end to end. This spec owns the two addresses
 * above (their users, passkeys, sessions and audit rows). A session is made
 * idle by moving its `lastActiveAt` back in the database, and the page's
 * clock is moved forward so the desk's own timer agrees; the limit is the
 * default 30 minutes.
 */
async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: EMAILS } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: users.map((row) => row.id) } },
  });
  // Passkeys and sessions cascade with the user.
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
}

/** A desk context with a virtual authenticator that verifies the user. */
async function actor(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: BACKOFFICE });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { context, page };
}

async function addPasskey(page: Page) {
  await page.goto('/passkeys');
  await expect(page.getByRole('heading', { name: 'Your passkeys' })).toBeVisible();
  await expect(async () => {
    await page.getByLabel('Name (optional)').fill('E2E idle laptop');
    await page
      .getByRole('button', { name: /^(Set up a passkey|Add another passkey)$/ })
      .click();
    await expect(page.getByText('E2E idle laptop', { exact: true })).toBeVisible({
      timeout: 5_000,
    });
  }).toPass();
}

/** Sign in from the desk login with the page's passkey. */
async function signInWithPasskey(page: Page) {
  const button = page.getByRole('button', { name: 'Sign in with a passkey' });
  await expect(async () => {
    // A click before hydration does nothing; click again only while still here.
    if (new URL(page.url()).pathname === '/login') await button.click();
    await page.waitForURL(/\/dashboard$/, { timeout: 10_000, waitUntil: 'commit' });
  }).toPass({ timeout: 60_000 });
}

async function latestSession(email: string) {
  return prisma.session.findFirstOrThrow({
    where: { user: { email } },
    orderBy: { createdAt: 'desc' },
  });
}

/** The session's last reported input, `minutes` ago. */
async function idleFor(email: string, minutes: number) {
  const session = await latestSession(email);
  await prisma.session.update({
    where: { id: session.id },
    data: { lastActiveAt: new Date(Date.now() - minutes * MINUTE) },
  });
  return session.id;
}

test.describe('M9 desk idle lock', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await cleanup();
    await prisma.user.createMany({
      data: [
        { email: OPS, fullName: 'Ernesto Idle', role: 'OPERATIONS_ADMIN' },
        { email: OWN, fullName: 'Ana Own', role: 'SUPER_ADMIN' },
      ],
    });
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('an idle desk locks in place, refuses everything, and unlocks with a passkey', async ({
    browser,
  }) => {
    const { context, page } = await actor(browser);
    await signIn(page, OPS, { callbackPath: '/passkeys' });
    await addPasskey(page);
    await page.goto('/login');
    await signInWithPasskey(page);

    await page.clock.install();
    await page.goto('/bookings');
    const heading = page.getByRole('heading', { level: 1, name: 'Bookings' });
    await expect(heading).toBeVisible();

    const lockedSession = await idleFor(OPS, 31);
    await page.clock.fastForward(31 * MINUTE);
    const lock = page.getByRole('dialog', { name: 'Locked · Ernesto Idle' });
    await expect(lock).toBeVisible();
    await expect(
      lock.getByText(
        'No input for 30 minutes. The page you were on is kept; timers kept running on the server.',
      ),
    ).toBeVisible();
    await expect(
      lock.getByRole('button', { name: 'Not Ernesto? Sign in' }),
    ).toBeVisible();
    // The page behind is kept but hidden and inert.
    await expect(heading).toBeHidden();
    await expect(page).toHaveURL(/\/bookings$/);

    const refused = await page.request.get('/api/ota/me/session');
    expect(refused.status()).toBe(401);
    expect(await refused.json()).toMatchObject({
      code: 'SESSION_LOCKED',
      idleLockMinutes: 30,
    });
    // L5: a locked desk cannot add its own passkey through Better Auth and
    // unlock with it, nor report input to unlock itself.
    const register = await page.request.get(
      '/api/auth/passkey/generate-register-options',
    );
    expect(register.status()).toBe(401);
    expect((await page.request.post('/api/ota/me/activity')).status()).toBe(401);

    const findings = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
    expect(findings.violations.map((violation) => violation.id)).toEqual([]);

    await lock.getByRole('button', { name: 'Unlock with passkey' }).click();
    await expect(lock).toBeHidden();
    await expect(heading).toBeVisible();
    await expect(page).toHaveURL(/\/bookings$/);
    const unlocked = await latestSession(OPS);
    expect(unlocked.id).not.toBe(lockedSession);
    expect(unlocked.signInMethod).toBe('passkey');
    expect((await page.request.get('/api/ota/me/session')).status()).toBe(200);

    // A reload while locked shows the lock instead of the page.
    await idleFor(OPS, 31);
    await page.reload();
    await expect(lock).toBeVisible();
    await expect(heading).toHaveCount(0);
    await context.close();
  });

  test('a session marked as the person’s own device at sign-in never locks', async ({
    browser,
  }) => {
    const { context, page } = await actor(browser);
    await signIn(page, OWN, { callbackPath: '/passkeys' });
    await addPasskey(page);
    await page.goto('/login');
    const own = page.getByRole('checkbox', { name: /This is my own device/ });
    await expect(async () => {
      await own.check();
      expect(
        await page.evaluate(() => window.localStorage.getItem('ota-desk-own-device')),
      ).toBe('yes');
    }).toPass();
    await signInWithPasskey(page);

    await expect
      .poll(async () => (await latestSession(OWN)).ownDevice, { timeout: 15_000 })
      .toBe(true);
    const marked = await prisma.auditLog.findMany({
      where: { action: 'auth.session_own_device', actor: { email: OWN } },
    });
    expect(marked).toHaveLength(1);

    await idleFor(OWN, 600);
    const response = await page.request.get('/api/ota/me/session');
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      ownDevice: true,
      idleLockMinutes: null,
    });

    await page.goto('/settings?tab=security');
    await expect(
      page.getByText('30 min with no input; never on an own device'),
    ).toBeVisible();
    await expect(page.getByRole('dialog', { name: /^Locked/ })).toHaveCount(0);
    await context.close();
  });
});

import { PrismaClient } from '@ota/db';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import { signIn } from './helpers';

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const BACKOFFICE = 'http://localhost:3002';
const SUPER_A = 'passkey-e2e-super-a@example.test';
const SUPER_B = 'passkey-e2e-super-b@example.test';
const OPS = 'passkey-e2e-ops@example.test';
const EMAILS = [SUPER_A, SUPER_B, OPS];
const REASON_ON = 'E2E passkeys: switch the staff rule on';
const REASON_OFF = 'E2E passkeys: switch the staff rule off';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

/**
 * docs/schema-m9-passkeys.md, end to end, with Chromium's virtual
 * authenticator. This spec owns the three addresses above (their users,
 * passkeys, sessions and audit rows) and the settings versions whose reason
 * starts with "E2E passkeys". It switches the staff rule on, so every other
 * staff session is held back until it switches the rule off again in
 * `afterAll`; the suite runs one spec at a time, so nothing else sees it.
 */
async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: EMAILS } },
    select: { id: true },
  });
  const versions = await prisma.operatingSettings.findMany({
    where: { reason: { startsWith: 'E2E passkeys' } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [...users, ...versions].map((row) => row.id) } },
  });
  await prisma.operatingSettings.deleteMany({
    where: { id: { in: versions.map((row) => row.id) } },
  });
  // Passkeys and sessions cascade with the user.
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
}

interface Actor {
  context: BrowserContext;
  page: Page;
}

/** A desk context with a virtual authenticator that verifies the user (P6). */
async function actor(browser: Browser): Promise<Actor> {
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

/** Add a passkey on /passkeys while the rule is off (state `ok`). */
async function addPasskey(page: Page, name: string) {
  await page.goto('/passkeys');
  await expect(page.getByRole('heading', { name: 'Your passkeys' })).toBeVisible();
  await expect(async () => {
    await page.getByLabel('Name (optional)').fill(name);
    await page
      .getByRole('button', { name: /^(Set up a passkey|Add another passkey)$/ })
      .click();
    await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 5_000 });
  }).toPass();
}

/** Sign in from the desk login with the page's passkey. */
async function signInWithPasskey(page: Page) {
  await page.goto('/login');
  const button = page.getByRole('button', { name: 'Sign in with a passkey' });
  await expect(async () => {
    // A click before hydration does nothing; click again only while still here.
    if (new URL(page.url()).pathname === '/login') await button.click();
    await page.waitForURL(/\/dashboard$/, { timeout: 10_000, waitUntil: 'commit' });
  }).toPass({ timeout: 60_000 });
}

async function signInMethods(email: string): Promise<(string | null)[]> {
  const sessions = await prisma.session.findMany({
    where: { user: { email } },
    orderBy: { createdAt: 'asc' },
    select: { signInMethod: true },
  });
  return sessions.map((session) => session.signInMethod);
}

/** Propose the switch with `proposer` and apply it with `approver`, both passkey sessions. */
async function switchRule(proposer: Page, approver: Page, on: boolean) {
  const current = await proposer.request.get('/api/ota/settings/operating');
  expect(current.status()).toBe(200);
  const { values } = (await current.json()) as { values: Record<string, unknown> };
  const proposed = await proposer.request.post('/api/ota/settings/operating/versions', {
    data: {
      values: { ...values, staffPasskeysRequired: on },
      reason: on ? REASON_ON : REASON_OFF,
    },
  });
  expect(proposed.status()).toBe(201);
  const { id } = (await proposed.json()) as { id: string };
  const applied = await approver.request.post(
    `/api/ota/settings/operating/versions/${id}/apply`,
  );
  expect(applied.status()).toBe(200);
}

test.describe('M9 staff passkeys', () => {
  // One worker for the whole describe: a failure skips the rest and
  // `afterAll` switches the rule off with the same Super Admin sessions.
  test.describe.configure({ mode: 'serial' });
  let superA: Actor;
  let superB: Actor;
  let ruleOn = false;

  test.beforeAll(async ({ browser }) => {
    await cleanup();
    await prisma.user.createMany({
      data: [
        { email: SUPER_A, fullName: 'E2E Passkey Super A', role: 'SUPER_ADMIN' },
        { email: SUPER_B, fullName: 'E2E Passkey Super B', role: 'SUPER_ADMIN' },
        { email: OPS, fullName: 'E2E Passkey Ops', role: 'OPERATIONS_ADMIN' },
      ],
    });
    superA = await actor(browser);
    superB = await actor(browser);
  });

  test.afterAll(async () => {
    // Never leave the rule on for the rest of the suite.
    if (ruleOn) await switchRule(superA.page, superB.page, false);
    await superA?.context.close();
    await superB?.context.close();
    await cleanup();
    await prisma.$disconnect();
  });

  test('a Super Admin enrolls a passkey, signs in with it, and the session records it', async () => {
    for (const [who, email] of [
      [superA, SUPER_A],
      [superB, SUPER_B],
    ] as const) {
      await signIn(who.page, email, { callbackPath: '/passkeys' });
      await addPasskey(who.page, 'E2E laptop');
      await signInWithPasskey(who.page);
      await expect(who.page.getByRole('link', { name: 'Passkeys' })).toBeVisible();
      expect((await signInMethods(email)).at(-1)).toBe('passkey');
    }
    expect(await signInMethods(SUPER_A)).toContain('magic_link');

    const added = await prisma.auditLog.findMany({
      where: { action: 'auth.passkey_added', actor: { email: SUPER_A } },
    });
    expect(added).toHaveLength(1);
  });

  test('switching the rule on warns about staff with no passkey', async () => {
    await superA.page.goto('/settings?tab=thresholds');
    const passkeySwitch = superA.page.getByLabel('Staff sign in with a passkey', {
      exact: true,
    });
    await expect(async () => {
      // A selection made before hydration is lost, and re-selecting the same
      // option fires no change, so toggle on every attempt.
      await passkeySwitch.selectOption('off');
      await passkeySwitch.selectOption('on');
      await expect(
        superA.page.getByText(/active staff members? (has|have) no passkey yet/),
      ).toBeVisible({ timeout: 2_000 });
    }).toPass();

    await switchRule(superA.page, superB.page, true);
    ruleOn = true;
    // The Super Admins keep working from their passkey sessions.
    expect((await superA.page.request.get('/api/ota/settings/operating')).status()).toBe(
      200,
    );
    await superB.page.goto('/settings?tab=security');
    await expect(superB.page.getByText('Required at sign-in')).toBeVisible();
  });

  test('with the rule on, a link session only sets up a passkey, then signs in with it', async ({
    browser,
  }) => {
    const ops = await actor(browser);
    await signIn(ops.page, OPS, { callbackPath: '/passkeys' });
    await expect(
      ops.page.getByRole('heading', { name: 'Set up your passkey' }),
    ).toBeVisible();

    const refused = await ops.page.request.get('/api/ota/settings/operating');
    expect(refused.status()).toBe(403);
    expect(((await refused.json()) as { code: string }).code).toBe(
      'PASSKEY_SETUP_REQUIRED',
    );
    // The desk sends the setup-only session back to the setup page.
    await ops.page.goto('/dashboard');
    await expect(ops.page).toHaveURL(/\/passkeys$/);

    await expect(async () => {
      await ops.page.getByLabel('Name (optional)').fill('E2E phone');
      await ops.page.getByRole('button', { name: 'Set up a passkey' }).click();
      await expect(ops.page.getByText('Passkey added. Now sign in with it.')).toBeVisible(
        {
          timeout: 5_000,
        },
      );
    }).toPass();
    await ops.page.getByRole('button', { name: 'Sign in with your passkey' }).click();
    await ops.page.waitForURL(/\/dashboard$/);
    expect((await ops.page.request.get('/api/ota/settings/operating')).status()).toBe(
      200,
    );

    // The last passkey stays while the rule is on.
    await ops.page.goto('/passkeys');
    await ops.page.getByRole('button', { name: 'Remove: E2E phone' }).click();
    await expect(
      ops.page.getByText('Staff must sign in with a passkey, so the last one stays'),
    ).toBeVisible();
    expect(await prisma.passkey.count({ where: { user: { email: OPS } } })).toBe(1);

    // A Super Admin resets the lost device: the user is signed out and told.
    await superA.page.goto('/settings?tab=users');
    const row = superA.page.getByRole('row', { name: new RegExp(OPS) });
    await row.getByRole('button', { name: 'Reset passkeys' }).click();
    await row.getByLabel('Reason (for the audit log)').fill('E2E lost phone');
    await row.getByRole('button', { name: 'Reset and sign out' }).click();
    await expect(row.getByRole('button', { name: 'Reset passkeys' })).toHaveCount(0);
    expect(await prisma.passkey.count({ where: { user: { email: OPS } } })).toBe(0);
    expect((await ops.page.request.get('/api/ota/settings/operating')).status()).toBe(
      401,
    );
    await expect(async () => {
      const response = await fetch(
        `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${OPS}`)}`,
      );
      const { messages } = (await response.json()) as { messages: { Subject: string }[] };
      expect(messages.map((message) => message.Subject)).toContain(
        // Staff emails use the tenant's primary language (es in the demo tenant).
        'Se restablecieron sus llaves de acceso de Vereda Expeditions',
      );
    }).toPass({ timeout: 15_000 });
    await ops.context.close();
  });

  test('switching the rule off lets link sessions back onto the desk', async ({
    browser,
  }) => {
    await switchRule(superA.page, superB.page, false);
    ruleOn = false;
    const ops = await actor(browser);
    await signIn(ops.page, OPS);
    expect((await ops.page.request.get('/api/ota/settings/operating')).status()).toBe(
      200,
    );
    await ops.context.close();

    // With the rule off, a passkey session may remove its last passkey, audited.
    await superA.page.goto('/passkeys');
    const remove = superA.page.getByRole('button', { name: 'Remove: E2E laptop' });
    await expect(async () => {
      if (await remove.count()) await remove.click();
      await expect(superA.page.getByText('No passkeys yet.')).toBeVisible({
        timeout: 3_000,
      });
    }).toPass();
    const removed = await prisma.auditLog.findMany({
      where: { action: 'auth.passkey_removed', actor: { email: SUPER_A } },
    });
    expect(removed).toHaveLength(1);
  });
});

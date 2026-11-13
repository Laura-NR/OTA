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

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const BACKOFFICE = 'http://localhost:3002';
const SUPER = 'recovery-e2e-super@example.test';
const OPS = 'recovery-e2e-ops@example.test';
const EMAILS = [SUPER, OPS];
const CODE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();
let opsId = '';

/**
 * docs/schema-m9-recovery-codes.md, end to end. This spec owns the two
 * addresses above: their users, passkeys, sessions, recovery codes (all
 * cascade with the user) and audit rows. The passkey switch stays off, so
 * the recovery session's setup-only rule is its own (R3).
 */
async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: EMAILS } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: users.map((row) => row.id) } },
  });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
}

interface Actor {
  context: BrowserContext;
  page: Page;
}

/** A desk context with a virtual authenticator that verifies the user. */
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

async function subjectsTo(email: string): Promise<string[]> {
  const response = await fetch(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
  );
  const { messages } = (await response.json()) as { messages: { Subject: string }[] };
  return messages.map((message) => message.Subject);
}

async function audits(action: string): Promise<number> {
  return prisma.auditLog.count({ where: { action, entityId: opsId } });
}

/** Open the ops row's dialog, give a reason and return the code it shows once. */
async function issueCode(page: Page): Promise<string> {
  await page.goto('/settings?tab=users');
  const row = page.getByRole('row', { name: new RegExp(OPS) });
  const dialog = page.getByRole('dialog', { name: 'Recovery code for E2E Recovery Ops' });
  await expect(async () => {
    await row.getByRole('button', { name: 'Issue recovery code…' }).click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await dialog.getByLabel('Reason (for the audit log)').fill('E2E mailbox locked');
  await dialog.getByRole('button', { name: 'Issue code' }).click();
  const code = dialog.getByText(CODE);
  await expect(code).toBeVisible();
  const value = (await code.textContent())!.trim();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  return value;
}

function redeem(page: Page, code: string) {
  return page.request.post('/api/auth/sign-in/recovery-code', {
    data: { email: OPS, code },
    headers: { origin: BACKOFFICE },
  });
}

test.describe('M9 staff recovery codes', () => {
  test.describe.configure({ mode: 'serial' });
  let superAdmin: Actor;

  test.beforeAll(async ({ browser }) => {
    await cleanup();
    await prisma.user.createMany({
      data: [
        { email: SUPER, fullName: 'E2E Recovery Super', role: 'SUPER_ADMIN' },
        { email: OPS, fullName: 'E2E Recovery Ops', role: 'OPERATIONS_ADMIN' },
      ],
    });
    opsId = (await prisma.user.findUniqueOrThrow({ where: { email: OPS } })).id;
    superAdmin = await actor(browser);
  });

  test.afterAll(async () => {
    await superAdmin?.context.close();
    await cleanup();
    await prisma.$disconnect();
  });

  test('a Super Admin issues a code once; it removes the lost passkey and tells the person', async ({
    browser,
  }) => {
    // The staff member had a passkey on the device they lost.
    const lost = await actor(browser);
    await signIn(lost.page, OPS, { callbackPath: '/passkeys' });
    await expect(async () => {
      await lost.page.getByLabel('Name (optional)').fill('E2E lost phone');
      await lost.page.getByRole('button', { name: 'Set up a passkey' }).click();
      await expect(lost.page.getByText('E2E lost phone', { exact: true })).toBeVisible({
        timeout: 5_000,
      });
    }).toPass();
    await lost.context.close();

    await signIn(superAdmin.page, SUPER, { callbackPath: '/settings?tab=users' });
    const page = superAdmin.page;
    const row = page.getByRole('row', { name: new RegExp(OPS) });
    const dialog = page.getByRole('dialog', {
      name: 'Recovery code for E2E Recovery Ops',
    });
    await expect(async () => {
      await row.getByRole('button', { name: 'Issue recovery code…' }).click();
      await expect(dialog).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await expect(
      dialog.getByText(
        /removes E2E Recovery Ops's passkey and signs them out everywhere/,
      ),
    ).toBeVisible();
    expect(
      await new AxeBuilder({ page })
        .include('dialog[open]')
        .withTags(WCAG_22_AA)
        .analyze(),
    ).toMatchObject({ violations: [] });
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    const code = await issueCode(page);
    expect(code).toMatch(CODE);
    await expect(row.getByText(/^Recovery code open until \d\d:\d\d$/)).toBeVisible();
    expect(await prisma.passkey.count({ where: { userId: opsId } })).toBe(0);
    const [stored] = await prisma.staffRecoveryCode.findMany({
      where: { userId: opsId },
    });
    expect(stored!.codeHash).not.toContain(code.replace(/-/g, ''));
    expect(
      await prisma.auditLog.findMany({
        where: { action: 'staff.recovery_code_issued', entityId: opsId },
        select: { actor: { select: { email: true } }, metadata: true },
      }),
    ).toEqual([
      {
        actor: { email: SUPER },
        metadata: expect.objectContaining({ reason: 'E2E mailbox locked', passkeys: 1 }),
      },
    ]);
    // Staff emails use the tenant's primary language (es in the demo tenant).
    await expect(async () =>
      expect(await subjectsTo(OPS)).toContain(
        'Se emitió un código de recuperación para su cuenta de Vereda Expeditions',
      ),
    ).toPass({ timeout: 15_000 });
  });

  test('the code signs in once, only to set up a passkey, which then signs in', async ({
    browser,
  }) => {
    const code = await issueCode(superAdmin.page);
    const ops = await actor(browser);
    const page = ops.page;
    await page.goto('/login');
    await page.getByLabel('Email').fill(OPS);
    const open = page.getByRole('button', { name: 'Use a recovery code' });
    await expect(async () => {
      await open.click({ timeout: 1_000 });
      await expect(page.getByLabel('Recovery code')).toBeVisible({ timeout: 1_000 });
    }).toPass();
    expect(await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze()).toMatchObject({
      violations: [],
    });

    // A wrong code is refused alike, and counts as one wrong try.
    await page.getByLabel('Recovery code').fill('AAAA-AAAA-AAAA');
    await page.getByRole('button', { name: 'Sign in with the code' }).click();
    await expect(
      page.getByText('This code is not valid. Ask a Super Admin for a new one.'),
    ).toBeVisible();

    // Typed as read out over the phone: lower case, spaces for hyphens.
    await page.getByLabel('Recovery code').fill(code.toLowerCase().replace(/-/g, ' '));
    await page.getByRole('button', { name: 'Sign in with the code' }).click();
    await page.waitForURL(/\/passkeys$/);
    await expect(page.getByText(/^You signed in with a recovery code\./)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Set up your passkey' }),
    ).toBeVisible();
    const session = await prisma.session.findFirstOrThrow({
      where: { userId: opsId },
      orderBy: { createdAt: 'desc' },
    });
    expect(session.signInMethod).toBe('recovery_code');

    // The passkey switch is off, but the session still reaches nothing else.
    const refused = await page.request.get('/api/ota/reservations');
    expect(refused.status()).toBe(403);
    expect(((await refused.json()) as { code: string }).code).toBe(
      'PASSKEY_SETUP_REQUIRED',
    );
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/passkeys$/);

    await expect(async () => {
      await page.getByLabel('Name (optional)').fill('E2E new phone');
      await page.getByRole('button', { name: 'Set up a passkey' }).click();
      await expect(page.getByText('Passkey added. Now sign in with it.')).toBeVisible({
        timeout: 5_000,
      });
    }).toPass();
    await page.getByRole('button', { name: 'Sign in with your passkey' }).click();
    await page.waitForURL(/\/dashboard$/);
    expect((await page.request.get('/api/ota/reservations')).status()).toBe(200);

    // The code worked once.
    expect((await redeem(page, code)).status()).toBe(401);
    expect(await audits('auth.recovery_code_used')).toBe(1);
    await expect(async () =>
      expect(await subjectsTo(OPS)).toContain(
        'Se usó su código de recuperación de Vereda Expeditions',
      ),
    ).toPass({ timeout: 15_000 });
    await ops.context.close();
  });

  test('five wrong tries withdraw a code, and a Super Admin can withdraw one', async () => {
    const page = superAdmin.page;
    const first = await issueCode(page);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await redeem(page, 'AAAA-AAAA-AAAA')).status()).toBe(401);
    }
    expect((await redeem(page, first)).status()).toBe(401);
    expect(await audits('auth.recovery_code_voided')).toBe(1);

    const second = await issueCode(page);
    const row = page.getByRole('row', { name: new RegExp(OPS) });
    await row
      .getByRole('button', { name: 'Withdraw the recovery code for E2E Recovery Ops' })
      .click();
    await expect(row.getByText(/^Recovery code open until/)).toBeHidden();
    expect(await audits('staff.recovery_code_withdrawn')).toBe(1);
    expect((await redeem(page, second)).status()).toBe(401);
  });

  test('the Security tab states the recovery rule', async () => {
    await superAdmin.page.goto('/settings?tab=security');
    await expect(
      superAdmin.page.getByText('One-time code from a Super Admin, 15 minutes'),
    ).toBeVisible();
    await superAdmin.page.getByRole('link', { name: 'Issue recovery code…' }).click();
    await expect(superAdmin.page).toHaveURL(/tab=users$/);
  });
});

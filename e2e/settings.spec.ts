import { PrismaClient } from '@ota/db';
import { expect, test, type Browser } from '@playwright/test';

import { signIn } from './helpers';

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const FOUNDER = 'settings-e2e-founder@example.test';
const OPS = 'settings-e2e-ops@example.test';
const INVITEE = 'settings-e2e-invitee@example.test';
const REASON = 'E2E settings check';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

/**
 * This spec owns the three addresses above (their users, sessions, invites
 * and audit rows) and every operating_settings version whose reason starts
 * with "E2E". It changes only the resources staleness, which no other spec
 * reads, so the API's 60 s settings cache cannot disturb them.
 */
async function cleanup() {
  const versions = await prisma.operatingSettings.findMany({
    where: { reason: { startsWith: 'E2E' } },
    select: { id: true },
  });
  const invites = await prisma.staffInvite.findMany({
    where: { email: INVITEE },
    select: { id: true },
  });
  const users = await prisma.user.findMany({
    where: { email: { in: [FOUNDER, OPS, INVITEE] } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: {
      entityId: {
        in: [...versions, ...invites, ...users].map((row) => row.id),
      },
    },
  });
  await prisma.operatingSettings.deleteMany({
    where: { id: { in: versions.map((row) => row.id) } },
  });
  await prisma.staffInvite.deleteMany({ where: { email: INVITEE } });
  await prisma.user.deleteMany({ where: { email: { in: [FOUNDER, OPS, INVITEE] } } });
}

/** A new browser context signed in as `email`, landing on `callbackPath`. */
async function as(browser: Browser, email: string, callbackPath = '/dashboard') {
  const context = await browser.newContext({ baseURL: 'http://localhost:3002' });
  const page = await context.newPage();
  await signIn(page, email, { callbackPath });
  return { context, page };
}

/** The invitation link from the newest invitation email to this address. */
async function invitationLink(email: string): Promise<string> {
  let link = '';
  await expect(async () => {
    const response = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const { messages } = (await response.json()) as { messages: { ID: string }[] };
    expect(messages.length).toBeGreaterThan(0);
    const detail = (await (
      await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0]!.ID}`)
    ).json()) as { Text: string };
    const match = /https?:\/\/\S+\/invite\?token=[^\s"<>]+/.exec(detail.Text);
    expect(match).not.toBeNull();
    link = match![0];
  }).toPass({ timeout: 20_000 });
  return link;
}

test.describe('M9 settings', () => {
  test.beforeAll(async () => {
    await cleanup();
    await prisma.user.create({
      data: { email: FOUNDER, fullName: 'E2E Founder', role: 'SUPER_ADMIN' },
    });
    await prisma.user.create({
      data: { email: OPS, fullName: 'E2E Ops', role: 'OPERATIONS_ADMIN' },
    });
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('a Super Admin proposes a threshold and a second one applies it', async ({
    page,
    browser,
  }) => {
    await signIn(page);
    await page.goto('/settings?tab=thresholds');
    await expect(
      page.getByRole('heading', { name: 'Thresholds in force' }),
    ).toBeVisible();
    await expect(async () => {
      await page.getByLabel('Resources stale after', { exact: true }).fill('6');
      await expect(page.getByText('Changes: Resources stale after.')).toBeVisible({
        timeout: 2_000,
      });
    }).toPass();
    await page.getByLabel('Why').fill(REASON);
    await page.getByRole('button', { name: /^Propose/ }).click();
    await expect(
      page.getByRole('heading', { name: /waits for a second Super Admin/ }),
    ).toBeVisible();
    // The proposer can only withdraw.
    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Withdraw' })).toBeVisible();

    const founder = await as(browser, FOUNDER, '/settings?tab=thresholds');
    await expect(
      founder.page.getByText(`Proposed by Platform Super Admin: ${REASON}`),
    ).toBeVisible();
    await founder.page.getByRole('button', { name: 'Apply', exact: true }).click();
    const row = founder.page.getByRole('row', { name: /Resources stale after/ });
    await expect(row.getByRole('cell').nth(1)).toHaveText('6 days');
    await expect(
      founder.page.getByText(/^Version \d+, applied .* by E2E Founder\.$/),
    ).toBeVisible();
    await founder.context.close();
  });

  test('an invited address signs in, accepts and joins the desk with its role', async ({
    page,
    browser,
  }) => {
    await signIn(page);
    await page.goto('/settings?tab=users');
    await expect(async () => {
      await page.getByLabel('Work email').fill(INVITEE);
      await page.getByLabel('Role', { exact: true }).selectOption('OPERATIONS_ADMIN');
      await page.getByRole('button', { name: /^Send invitation/ }).click();
      await expect(page.getByText(INVITEE)).toBeVisible({ timeout: 3_000 });
    }).toPass();
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: INVITEE })
        .getByText('Sent', { exact: true }),
    ).toBeVisible();

    const link = new URL(await invitationLink(INVITEE));
    const invitee = await as(browser, INVITEE, `${link.pathname}${link.search}`);
    await expect(invitee.page.getByText(`Signed in as ${INVITEE}.`)).toBeVisible();
    await expect(async () => {
      await invitee.page.getByRole('button', { name: 'Accept the invitation' }).click();
      await expect(
        invitee.page.getByText('Welcome: you are on the desk as Operations Admin.'),
      ).toBeVisible({ timeout: 3_000 });
    }).toPass();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: INVITEE } });
    expect(user.role).toBe('OPERATIONS_ADMIN');
    await invitee.context.close();
  });

  test('a deactivated user is signed out and refused', async ({ page, browser }) => {
    const ops = await as(browser, OPS);
    expect((await ops.page.request.get('/api/ota/settings/operating')).status()).toBe(
      200,
    );

    await signIn(page);
    await page.goto('/settings?tab=users');
    const row = page.getByRole('row', { name: new RegExp(OPS) });
    await expect(async () => {
      await row.getByRole('button', { name: 'Deactivate' }).click();
      await expect(row.getByText('Deactivated', { exact: true })).toBeVisible({
        timeout: 3_000,
      });
    }).toPass();

    expect((await ops.page.request.get('/api/ota/settings/operating')).status()).toBe(
      401,
    );
    await ops.context.close();
  });
});

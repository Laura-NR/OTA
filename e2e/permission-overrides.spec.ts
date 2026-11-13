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
const SUPER = 'override-e2e-super@example.test';
const SUPPORT = 'override-e2e-support@example.test';
const EMAILS = [SUPER, SUPPORT];
const SUPPORT_NAME = 'E2E Override Support';
// The staff emails go out in the tenant's primary language (es).
const SUBJECT = `${SUPPORT_NAME} pide una excepción de permisos`;
const ITEM = 'E2E Override Casa';
const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

/**
 * docs/schema-m9-permission-overrides.md, end to end. This spec owns the two
 * addresses above (their overrides cascade with the user), their audit rows
 * and the catalog item it creates.
 */
async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: EMAILS } },
    select: { id: true },
  });
  const ids = users.map((row) => row.id);
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
  await prisma.inventoryItem.deleteMany({ where: { name: ITEM } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
}

interface Desk {
  context: BrowserContext;
  page: Page;
}

async function deskFor(browser: Browser, email: string, path: string): Promise<Desk> {
  const context = await browser.newContext({ baseURL: BACKOFFICE });
  const page = await context.newPage();
  await signIn(page, email, { callbackPath: path });
  return { context, page };
}

async function requestEmails(): Promise<unknown[]> {
  const response = await fetch(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${SUPER} subject:"${SUBJECT}"`)}`,
  );
  return ((await response.json()) as { messages: unknown[] }).messages;
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  expect(results.violations).toEqual([]);
}

test.describe('M9 permission overrides', () => {
  test.describe.configure({ mode: 'serial' });
  let superAdmin: Desk;
  let support: Desk;

  test.beforeAll(async ({ browser }) => {
    await cleanup();
    await prisma.user.createMany({
      data: [
        { email: SUPER, fullName: 'E2E Override Super', role: 'SUPER_ADMIN' },
        { email: SUPPORT, fullName: SUPPORT_NAME, role: 'ADMINISTRATIVE_SUPPORT' },
      ],
    });
    superAdmin = await deskFor(browser, SUPER, '/settings?tab=permissions');
    support = await deskFor(browser, SUPPORT, '/packages/inventory');
  });

  test.afterAll(async () => {
    for (const desk of [superAdmin, support]) await desk?.context.close();
    await cleanup();
    await prisma.$disconnect();
  });

  test('support sees Inventory read-only and asks for an override; the Super Admins are emailed', async () => {
    const { page } = support;
    await page.goto('/packages/inventory');
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add item' })).toHaveCount(0);
    await expect(
      page.getByText(
        'Your role can view “Packages, catalog and imports” but not act on it here.',
      ),
    ).toBeVisible();
    await axe(page);

    await expect(async () => {
      await page.getByRole('button', { name: 'Request an override' }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await expect(page.getByRole('dialog')).toContainText('ends after 24 h');
    await page.getByLabel('Why you need it').fill('E2E: fix the casa while Ana is away');
    await page.getByRole('button', { name: 'Send the request' }).click();
    await expect(page.getByText(/waiting for a Super Admin/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Withdraw the request' }),
    ).toBeVisible();
    await expect.poll(requestEmails).toHaveLength(1);
  });

  test('a Super Admin approves it on Settings › Permissions', async () => {
    const { page } = superAdmin;
    await page.goto('/settings?tab=permissions');
    await expect(page.getByText('Override requests', { exact: true })).toBeVisible();
    await expect(page.getByText('E2E: fix the casa while Ana is away')).toBeVisible();
    await axe(page);
    await page
      .getByRole('button', { name: `Approve ${SUPPORT_NAME}'s override` })
      .click();
    await expect(page.getByText('No request is waiting.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: `End ${SUPPORT_NAME}'s override` }),
    ).toBeVisible();
  });

  test('support acts on that row only, and each change names the override in the audit log', async () => {
    const { page } = support;
    await page.goto('/packages/inventory');
    await expect(page.getByText(/active until/)).toBeVisible();
    await page.getByLabel('Name').fill(ITEM);
    await page.getByLabel('Province').fill('La Habana');
    await page.getByLabel('Base price').fill('90');
    await page.getByRole('button', { name: 'Add item' }).click();
    await expect(page.getByRole('link', { name: ITEM })).toBeVisible();

    const user = await prisma.user.findUniqueOrThrow({ where: { email: SUPPORT } });
    const used = await prisma.auditLog.findMany({
      where: { action: 'permission.override_used', actorUserId: user.id },
    });
    expect(used).toHaveLength(1);
    expect(used[0]!.metadata).toMatchObject({
      capability: 'catalog',
      method: 'POST',
      route: '/inventory',
    });

    // Another row stays refused.
    const payments = await page.request.post('/api/ota/payments/reminders/scan');
    expect(payments.status()).toBe(403);
  });

  test('the Super Admin ends it and the actions go', async () => {
    await superAdmin.page.goto('/settings?tab=permissions');
    await superAdmin.page
      .getByRole('button', { name: `End ${SUPPORT_NAME}'s override` })
      .click();
    await expect(superAdmin.page.getByText('No override is running.')).toBeVisible();
    await expect(superAdmin.page.getByText('Ended', { exact: true })).toBeVisible();

    const { page } = support;
    await page.goto('/packages/inventory');
    await expect(page.getByRole('button', { name: 'Add item' })).toHaveCount(0);
    await expect(page.getByText('Your last override for this has ended.')).toBeVisible();
    const refused = await page.request.post('/api/ota/inventory', {
      data: { type: 'ACCOMMODATION', name: `${ITEM} 2`, basePrice: 90 },
    });
    expect(refused.status()).toBe(403);
  });
});

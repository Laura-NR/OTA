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
const SUPER = 'ip-allowlist-e2e-super@example.test';
const SECOND = 'ip-allowlist-e2e-second@example.test';
const AWAY = 'ip-allowlist-e2e-away@example.test';
const OPS = 'ip-allowlist-e2e-ops@example.test';
const EMAILS = [SUPER, SECOND, AWAY, OPS];
const REASON = 'E2E ip-allowlist';
/** An address no e2e browser signs in from (TEST-NET-2). */
const OUTSIDE = '198.51.100.7';
const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

/**
 * docs/schema-m9-ip-allowlist.md, end to end. This spec owns the four
 * addresses above (their sessions cascade with the user), their audit rows
 * and the settings versions whose reason starts with "E2E ip-allowlist". It
 * switches the allowlist off again before it cleans up.
 */
async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: EMAILS } },
    select: { id: true },
  });
  const versions = await prisma.operatingSettings.findMany({
    where: { reason: { startsWith: REASON } },
    select: { id: true },
  });
  const ids = [...users, ...versions].map((row) => row.id);
  await prisma.auditLog.deleteMany({
    where: { OR: [{ entityId: { in: ids } }, { actorUserId: { in: ids } }] },
  });
  await prisma.operatingSettings.deleteMany({
    where: { id: { in: versions.map((row) => row.id) } },
  });
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

/** Make the person's sessions look signed in from elsewhere (the fixture's only trick). */
async function signedInFrom(email: string, ipAddress: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.session.updateMany({ where: { userId: user.id }, data: { ipAddress } });
}

/** One Super Admin proposes a change to the document; returns the version id. */
async function propose(page: Page, patch: Record<string, unknown>, reason: string) {
  const current = await page.request.get('/api/ota/settings/operating');
  const { values } = (await current.json()) as { values: Record<string, unknown> };
  const proposed = await page.request.post('/api/ota/settings/operating/versions', {
    data: { values: { ...values, ...patch }, reason: `${REASON} ${reason}` },
  });
  expect(proposed.status()).toBe(201);
  return ((await proposed.json()) as { id: string }).id;
}

test.describe('M9 Super Admin IP allowlist', () => {
  test.describe.configure({ mode: 'serial' });
  let superAdmin: Desk;
  let second: Desk;
  let switchedOn = false;

  test.beforeAll(async ({ browser }) => {
    await cleanup();
    await prisma.user.createMany({
      data: [
        { email: SUPER, fullName: 'E2E Allowlist Super', role: 'SUPER_ADMIN' },
        { email: SECOND, fullName: 'E2E Allowlist Second', role: 'SUPER_ADMIN' },
        { email: AWAY, fullName: 'E2E Allowlist Away', role: 'SUPER_ADMIN' },
        { email: OPS, fullName: 'E2E Allowlist Ops', role: 'OPERATIONS_ADMIN' },
      ],
    });
    superAdmin = await deskFor(browser, SUPER, '/settings?tab=thresholds');
    second = await deskFor(browser, SECOND, '/settings?tab=thresholds');
  });

  test.afterAll(async () => {
    if (switchedOn) {
      const id = await propose(
        superAdmin.page,
        { superAdminIpAllowlistOn: false },
        'off',
      );
      await second.page.request.post(`/api/ota/settings/operating/versions/${id}/apply`);
    }
    for (const desk of [superAdmin, second]) await desk?.context.close();
    await cleanup();
    await prisma.$disconnect();
  });

  test('a Super Admin proposes the allowlist with their own sign-in address', async () => {
    const { page } = superAdmin;
    await page.goto('/settings?tab=thresholds');
    await expect(page.getByText('Your sign-in address:')).toBeVisible();
    await expect(async () => {
      await page.getByRole('button', { name: 'Add my sign-in address' }).click();
      await expect(page.getByLabel('Label', { exact: true })).toHaveValue('My address', {
        timeout: 2_000,
      });
    }).toPass();
    // Switched on without the address it would refuse its proposer; with it, no warning.
    await page
      .getByLabel('Super Admin sign-ins only from the allowlisted IPs', { exact: true })
      .selectOption('on');
    await expect(page.getByText(/^With this list on/)).toHaveCount(0);
    await page.getByRole('button', { name: /^Remove/ }).click();
    await expect(
      page.getByText(/^With this list on, a Super Admin signed in from/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Add my sign-in address' }).click();
    await expect(page.getByText(/^With this list on/)).toHaveCount(0);

    // A second row with a typo shows the field's error before anything is sent.
    await page.getByRole('button', { name: 'Add an address' }).click();
    await page.getByLabel('Label', { exact: true }).nth(1).fill('Havana office');
    await page
      .getByLabel('Address or range', { exact: true })
      .nth(1)
      .fill('203.0.113.0/33');
    await expect(
      page.getByText('Enter an IPv4 or IPv6 address, or a range such as 203.0.113.0/24.'),
    ).toBeVisible();
    await page
      .getByLabel('Address or range', { exact: true })
      .nth(1)
      .fill('203.0.113.0/24');

    const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
    expect(results.violations).toEqual([]);

    await page.getByLabel('Why').fill(`${REASON} on`);
    await page.getByRole('button', { name: /^Propose/ }).click();
    await expect(
      page.getByRole('heading', { name: /waits for a second Super Admin/ }),
    ).toBeVisible();
    await expect(
      page.getByText(/My address · .+, Havana office · 203\.0\.113\.0\/24/),
    ).toBeVisible();
  });

  test('a second Super Admin applies it, and Security shows it on', async () => {
    const { page } = second;
    await page.goto('/settings?tab=thresholds');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    switchedOn = true;
    const row = page.getByRole('row', { name: /Super Admin sign-ins only from/ });
    await expect(row.getByRole('cell').nth(1)).toHaveText('On');

    await page.goto('/settings?tab=security');
    await expect(
      page.getByText('Super Admin IP allowlist', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('On · 2 addresses')).toBeVisible();
    await expect(page.getByText(/only from the listed addresses/)).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
    expect(results.violations).toEqual([]);
  });

  test('a Super Admin signed in from outside the list is signed out and told why', async ({
    browser,
  }) => {
    const away = await deskFor(browser, AWAY, '/settings?tab=thresholds');
    await signedInFrom(AWAY, OUTSIDE);
    await away.page.goto('/dashboard');
    await away.page.waitForURL(/\/login\?refused=ip/);
    await expect(
      away.page.getByText(
        `Super Admin sign-ins are only accepted from the agency's listed addresses. This one came from ${OUTSIDE}.`,
        { exact: false },
      ),
    ).toBeVisible();
    // The login page ended the refused session.
    const user = await prisma.user.findUniqueOrThrow({ where: { email: AWAY } });
    await expect.poll(() => prisma.session.count({ where: { userId: user.id } })).toBe(0);
    const results = await new AxeBuilder({ page: away.page })
      .withTags(WCAG_22_AA)
      .analyze();
    expect(results.violations).toEqual([]);
    await away.context.close();
  });

  test('an Operations Admin from the same address is not affected', async ({
    browser,
  }) => {
    const ops = await deskFor(browser, OPS, '/dashboard');
    await signedInFrom(OPS, OUTSIDE);
    await ops.page.goto('/dashboard');
    await expect(ops.page).toHaveURL(/\/dashboard$/);
    expect((await ops.page.request.get('/api/ota/me/session')).status()).toBe(200);
    await ops.context.close();
  });

  test('applying a list that leaves out the applier is refused', async () => {
    const id = await propose(
      second.page,
      {
        superAdminIpAllowlistOn: true,
        superAdminIpAllowlist: [{ label: 'Elsewhere', cidr: '192.0.2.0/24' }],
      },
      'elsewhere',
    );
    const { page } = superAdmin;
    await page.goto('/settings?tab=thresholds');
    await expect(
      page.getByText(/^With this list on, a Super Admin signed in from/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(
      page.getByText(
        /^This list would refuse your own sign-in from .+\. Add that address before applying it\.$/,
      ),
    ).toBeVisible();
    const withdrawn = await second.page.request.post(
      `/api/ota/settings/operating/versions/${id}/withdraw`,
    );
    expect(withdrawn.status()).toBe(200);
  });

  test('switched off by two Super Admins, a session from elsewhere works again', async ({
    browser,
  }) => {
    const away = await deskFor(browser, AWAY, '/settings?tab=thresholds');
    await signedInFrom(AWAY, OUTSIDE);
    expect((await away.page.request.get('/api/ota/me/session')).status()).toBe(403);

    const id = await propose(superAdmin.page, { superAdminIpAllowlistOn: false }, 'off');
    const applied = await second.page.request.post(
      `/api/ota/settings/operating/versions/${id}/apply`,
    );
    expect(applied.status()).toBe(200);
    switchedOn = false;
    expect((await away.page.request.get('/api/ota/me/session')).status()).toBe(200);
    await away.context.close();
  });
});

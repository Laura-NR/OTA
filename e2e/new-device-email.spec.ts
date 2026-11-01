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
const STOREFRONT = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const SUPER = 'new-device-e2e-super@example.test';
const SECOND = 'new-device-e2e-second@example.test';
const OPS = 'new-device-e2e-ops@example.test';
const TRAVELER = 'new-device-e2e-traveler@example.test';
const EMAILS = [SUPER, SECOND, OPS, TRAVELER];
// The staff emails go out in the tenant's primary language (es).
const SUBJECT = 'Nuevo acceso a su cuenta de la mesa de Vereda Expeditions';
const REASON = 'E2E new-device';
const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

/**
 * docs/schema-m9-new-device-email.md, end to end. This spec owns the four
 * addresses above (their users, sessions and known devices cascade with the
 * user), their audit rows and the settings versions whose reason starts with
 * "E2E new-device". It leaves the switch on.
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

/** A fresh browser: no device cookie yet. */
async function browserFor(browser: Browser, baseURL = BACKOFFICE): Promise<Desk> {
  const context = await browser.newContext({ baseURL });
  return { context, page: await context.newPage() };
}

async function newDeviceAudits(email: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return prisma.auditLog.count({
    where: { action: 'auth.new_device_sign_in', actorUserId: user.id },
  });
}

async function newDeviceEmails(email: string): Promise<{ ID: string }[]> {
  const response = await fetch(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email} subject:"${SUBJECT}"`)}`,
  );
  return ((await response.json()) as { messages: { ID: string }[] }).messages;
}

async function deviceCookie(context: BrowserContext) {
  return (await context.cookies(BACKOFFICE)).find(
    (cookie) => cookie.name === 'ota_device',
  );
}

/** The email goes out after the sign-in: give it time, then check none came. */
async function expectNoEmail(email: string) {
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  expect(await newDeviceEmails(email)).toHaveLength(0);
}

/** One Super Admin proposes the switch, the other applies it. */
async function setSwitch(proposer: Page, approver: Page, on: boolean) {
  const current = await proposer.request.get('/api/ota/settings/operating');
  const { values } = (await current.json()) as { values: Record<string, unknown> };
  const proposed = await proposer.request.post('/api/ota/settings/operating/versions', {
    data: {
      values: { ...values, staffNewDeviceEmail: on },
      reason: `${REASON} ${on ? 'on' : 'off'}`,
    },
  });
  expect(proposed.status()).toBe(201);
  const { id } = (await proposed.json()) as { id: string };
  const applied = await approver.request.post(
    `/api/ota/settings/operating/versions/${id}/apply`,
  );
  expect(applied.status()).toBe(200);
}

test.describe('M9 new-device email', () => {
  test.describe.configure({ mode: 'serial' });
  let superAdmin: Desk;
  let second: Desk;
  let laptop: Desk;
  let switchedOff = false;

  test.beforeAll(async ({ browser }) => {
    await cleanup();
    await prisma.user.createMany({
      data: [
        { email: SUPER, fullName: 'E2E Device Super', role: 'SUPER_ADMIN' },
        { email: SECOND, fullName: 'E2E Device Second', role: 'SUPER_ADMIN' },
        { email: OPS, fullName: 'E2E Device Ops', role: 'OPERATIONS_ADMIN' },
        { email: TRAVELER, fullName: 'E2E Device Traveler', role: 'TRAVELER' },
      ],
    });
    superAdmin = await browserFor(browser);
    await signIn(superAdmin.page, SUPER, { callbackPath: '/settings?tab=security' });
    second = await browserFor(browser);
    await signIn(second.page, SECOND, { callbackPath: '/settings?tab=thresholds' });
    laptop = await browserFor(browser);
  });

  test.afterAll(async () => {
    if (switchedOff) await setSwitch(superAdmin.page, second.page, true);
    for (const desk of [superAdmin, second, laptop]) await desk?.context.close();
    await cleanup();
    await prisma.$disconnect();
  });

  test('a first sign-in on a browser emails the person and leaves a device cookie', async () => {
    await signIn(laptop.page, OPS);
    await expect.poll(() => newDeviceEmails(OPS)).toHaveLength(1);
    const [message] = await newDeviceEmails(OPS);
    const detail = (await (
      await fetch(`${MAILPIT_URL}/api/v1/message/${message!.ID}`)
    ).json()) as { Text: string };
    expect(detail.Text).toContain('Dispositivo: Chrome · Linux');
    expect(detail.Text).toContain('Acceso con: un enlace de acceso');
    expect(detail.Text).toContain('avise ahora a un Super Admin');
    expect(await newDeviceAudits(OPS)).toBe(1);
    const cookie = await deviceCookie(laptop.context);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
  });

  test('signing in again on the same browser sends nothing', async () => {
    const before = await deviceCookie(laptop.context);
    await signIn(laptop.page, OPS);
    await expectNoEmail(OPS);
    expect(await newDeviceAudits(OPS)).toBe(1);
    expect((await deviceCookie(laptop.context))?.value).toBe(before?.value);
  });

  test('another browser is a new device', async ({ browser }) => {
    const phone = await browserFor(browser);
    await signIn(phone.page, OPS);
    await expect.poll(() => newDeviceEmails(OPS)).toHaveLength(1);
    expect(await newDeviceAudits(OPS)).toBe(2);
    await phone.context.close();
  });

  test('after a Super Admin resets the passkeys, every browser is new again', async () => {
    const ops = await prisma.user.findUniqueOrThrow({ where: { email: OPS } });
    const reset = await superAdmin.page.request.post(
      `/api/ota/staff/${ops.id}/reset-passkeys`,
      { data: { reason: 'E2E suspected compromise' } },
    );
    expect(reset.status()).toBe(200);
    expect(await prisma.staffKnownDevice.count({ where: { userId: ops.id } })).toBe(0);
    await signIn(laptop.page, OPS);
    await expect.poll(() => newDeviceEmails(OPS)).toHaveLength(1);
    expect(await newDeviceAudits(OPS)).toBe(3);
  });

  test('Security shows the switch; turned off by two Super Admins, a new device is recorded but not emailed', async ({
    browser,
  }) => {
    const { page } = superAdmin;
    await page.goto('/settings?tab=security');
    await expect(page.getByText('New-device email', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Emailed on every sign-in from a new device'),
    ).toBeVisible();
    await expect(page.getByText('An IP allowlist is not built yet.')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
    expect(results.violations).toEqual([]);

    await second.page.goto('/settings?tab=thresholds');
    await expect(
      second.page.getByText('Email staff on every new-device sign-in').first(),
    ).toBeVisible();

    await setSwitch(superAdmin.page, second.page, false);
    switchedOff = true;
    await page.goto('/settings?tab=security');
    await expect(page.getByText('Off; new devices are still recorded')).toBeVisible();

    const kiosk = await browserFor(browser);
    await signIn(kiosk.page, OPS);
    await expectNoEmail(OPS);
    expect(await newDeviceAudits(OPS)).toBe(4);
    await kiosk.context.close();

    await setSwitch(superAdmin.page, second.page, true);
    switchedOff = false;
  });

  test('a traveler sign-in records no device and sends no email', async ({ browser }) => {
    const storefront = await browserFor(browser, STOREFRONT);
    await signIn(storefront.page, TRAVELER, {
      origin: STOREFRONT,
      callbackPath: '/en/account',
    });
    await expectNoEmail(TRAVELER);
    expect(await newDeviceAudits(TRAVELER)).toBe(0);
    expect(
      (await storefront.context.cookies(STOREFRONT)).some(
        (cookie) => cookie.name === 'ota_device',
      ),
    ).toBe(false);
    await storefront.context.close();
  });
});

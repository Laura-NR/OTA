import { PrismaClient } from '@ota/db';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import { deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const FOUNDER = 'flags-e2e-founder@example.test';
const BOOKING_CODE = 'E2EFLG01';
const REASON_OFF = 'E2E flags: close the portal, the builder, the map and the card rail';
const REASON_ON = 'E2E flags: open them again';
const SWITCHED = [
  'recruitmentPortal',
  'customItineraryBuilder',
  'interactiveSvgMap',
  'creditCardGatewayRail',
];

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

/**
 * Runtime feature flags (M9 D8b), end to end: one Super Admin switches four
 * flags off in the Features group, a second applies it, and the storefront,
 * the API and the desk follow at once (the desk's Applications and Custom
 * proposals say their queue is closed); switching them on again reopens them.
 * This spec owns the address and booking above and the settings versions
 * whose reason starts with "E2E flags". `afterAll` switches the flags back on
 * with the same sessions, so no later spec sees them off.
 */
async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: FOUNDER },
    select: { id: true },
  });
  const versions = await prisma.operatingSettings.findMany({
    where: { reason: { startsWith: 'E2E flags' } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [...users, ...versions].map((row) => row.id) } },
  });
  await prisma.operatingSettings.deleteMany({
    where: { id: { in: versions.map((row) => row.id) } },
  });
  await prisma.user.deleteMany({ where: { email: FOUNDER } });
  await deleteReservationFixture(prisma, BOOKING_CODE);
}

async function desk(browser: Browser, email?: string, path = '/settings?tab=thresholds') {
  const context = await browser.newContext({ baseURL: 'http://localhost:3002' });
  const page = await context.newPage();
  await signIn(page, email, { callbackPath: path });
  return { context, page };
}

/** Propose `on` for the switched flags with one Super Admin and apply it with the other. */
async function switchFlags(proposer: Page, approver: Page, on: boolean) {
  const current = await proposer.request.get('/api/ota/settings/operating');
  expect(current.status()).toBe(200);
  const { values } = (await current.json()) as { values: Record<string, unknown> };
  const proposed = await proposer.request.post('/api/ota/settings/operating/versions', {
    data: {
      values: { ...values, ...Object.fromEntries(SWITCHED.map((flag) => [flag, on])) },
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

test.describe('M9 runtime feature flags', () => {
  test.describe.configure({ mode: 'serial' });
  let proposer: { context: BrowserContext; page: Page };
  let founder: { context: BrowserContext; page: Page };
  let reservationId = '';
  let flagsOff = false;

  test.beforeAll(async ({ browser }) => {
    await cleanup();
    await prisma.user.create({
      data: { email: FOUNDER, fullName: 'E2E Flags Founder', role: 'SUPER_ADMIN' },
    });
    const traveler = await prisma.user.findUniqueOrThrow({
      where: { email: 'traveler@example.test' },
    });
    const start = new Date(Date.now() + 60 * 86_400_000);
    reservationId = (
      await prisma.reservation.create({
        data: {
          userId: traveler.id,
          bookingCode: BOOKING_CODE,
          startDate: start,
          endDate: new Date(start.getTime() + 3 * 86_400_000),
          status: 'SECURED_AND_INVOICED',
          totalCurrency: 'EUR',
          totalAmount: '600.00',
        },
      })
    ).id;
    proposer = await desk(browser);
    founder = await desk(browser, FOUNDER);
  });

  test.afterAll(async () => {
    // Never leave the switched flags off for the rest of the suite.
    if (flagsOff) await switchFlags(proposer.page, founder.page, true);
    await proposer?.context.close();
    await founder?.context.close();
    await cleanup();
    await prisma.$disconnect();
  });

  test('a Super Admin proposes flags off in the Features group and a second applies them', async () => {
    const { page } = proposer;
    await expect(
      page.getByRole('heading', { name: 'Thresholds in force' }),
    ).toBeVisible();
    const row = page.getByRole('row', { name: /Recruitment portal/ });
    await expect(row.getByRole('cell').nth(1)).toHaveText('On');
    await expect(row.getByRole('cell').nth(3)).toHaveText(
      'Join our network: the page and new applications',
    );

    const features = page.getByRole('group', { name: 'Features' });
    await expect(async () => {
      await features
        .getByLabel('Recruitment portal', { exact: true })
        .selectOption('off');
      await expect(page.getByText('Changes: Recruitment portal.')).toBeVisible({
        timeout: 2_000,
      });
    }).toPass();
    await features.getByLabel('Destinations map', { exact: true }).selectOption('off');
    await features.getByLabel('Custom trip builder', { exact: true }).selectOption('off');
    await features.getByLabel('Card rail', { exact: true }).selectOption('off');
    await expect(
      page.getByText(
        'Changes: Destinations map, Recruitment portal, Custom trip builder, Card rail.',
      ),
    ).toBeVisible();
    await page.getByLabel('Why').fill(REASON_OFF);
    await page.getByRole('button', { name: /^Propose/ }).click();
    await expect(
      page.getByRole('heading', { name: /waits for a second Super Admin/ }),
    ).toBeVisible();

    // Proposed is not applied: the portal is still open.
    expect(
      (
        (await (
          await page.request.get(`${STOREFRONT_URL}/api/ota/tenant/config`)
        ).json()) as {
          features: Record<string, boolean>;
        }
      ).features.recruitmentPortal,
    ).toBe(true);

    await founder.page.reload();
    await founder.page.getByRole('button', { name: 'Apply', exact: true }).click();
    flagsOff = true;
    await expect(
      founder.page
        .getByRole('row', { name: /Recruitment portal/ })
        .getByRole('cell')
        .nth(1),
    ).toHaveText('Off');
  });

  test('the storefront, the API and the desk follow at once', async ({ page }) => {
    await page.goto(`${STOREFRONT_URL}/en/join`);
    await expect(
      page.getByRole('heading', { name: 'Applications are closed for now' }),
    ).toBeVisible();
    await expect(
      page.getByRole('contentinfo').getByRole('link', { name: 'Join our network' }),
    ).toHaveCount(0);

    const refused = await page.request.post(
      `${STOREFRONT_URL}/api/ota/supplier-applications`,
      {
        data: {
          fullName: 'E2E Flags Applicant',
          email: 'flags-e2e-applicant@example.test',
          phone: '+53 5555 0000',
          category: 'TOUR_GUIDE',
          provincesActive: ['La Habana'],
          rtnLicenseNumber: 'RTN-FLAGS-E2E',
        },
      },
    );
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toMatchObject({
      code: 'FEATURE_OFF',
      feature: 'recruitmentPortal',
    });

    // The province map is gone; the province buttons still pick.
    await page.goto(`${STOREFRONT_URL}/en/destinations`);
    await expect(page.getByRole('heading', { name: 'Cuba, west to east' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Pick a province for its hosts')).toBeVisible();

    // The desk offers only the transfer rail, and the API refuses a card link.
    const { page: deskPage } = proposer;
    await deskPage.goto(`/bookings/${reservationId}`);
    const payments = deskPage.getByRole('region', { name: /^Payments/ });
    await expect(payments.getByLabel('Rail')).toBeVisible();
    await expect(payments.getByLabel('Rail').locator('option')).toHaveText([
      'SEPA / open banking',
    ]);
    const card = await deskPage.request.post(
      `/api/ota/reservations/${reservationId}/payments`,
      { data: { rail: 'CARD' } },
    );
    expect(card.status()).toBe(409);
    expect(await card.json()).toMatchObject({ feature: 'creditCardGatewayRail' });

    // The desk's queues say nothing new arrives, and where to switch it back on.
    await deskPage.goto('/suppliers/applications');
    const recruitment = deskPage
      .getByRole('status')
      .filter({ hasText: 'Recruitment portal switched off' });
    await expect(recruitment).toContainText('Applications already received');
    await expect(
      recruitment.getByRole('link', { name: 'Approvals & thresholds' }),
    ).toHaveAttribute('href', '/settings?tab=thresholds');
    await deskPage.goto('/bookings/proposals');
    await expect(
      deskPage
        .getByRole('status')
        .filter({ hasText: 'Custom trip builder switched off' }),
    ).toContainText('Requests and proposals already here can still be worked.');
  });

  test('switching them on again reopens the portal and the map', async ({ page }) => {
    await switchFlags(proposer.page, founder.page, true);
    flagsOff = false;
    await page.goto(`${STOREFRONT_URL}/en/join`);
    await expect(page.getByRole('heading', { name: 'Join our network' })).toBeVisible();
    await expect(
      page.getByRole('contentinfo').getByRole('link', { name: 'Join our network' }),
    ).toBeVisible();
    await page.goto(`${STOREFRONT_URL}/en/destinations`);
    await expect(page.getByRole('heading', { name: 'Cuba, west to east' })).toBeVisible();
    await proposer.page.goto('/suppliers/applications');
    await expect(
      proposer.page.getByRole('heading', { name: 'Applications', level: 1 }),
    ).toBeVisible();
    await expect(proposer.page.getByText('Recruitment portal switched off')).toHaveCount(
      0,
    );
  });
});

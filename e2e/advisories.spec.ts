import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const TRAVELER_EMAIL = 'traveler@example.test';
const OPS_EMAIL = 'advisory-ops-e2e@example.test';
const BOOKING = 'E2EADV01';
const HEADLINE = 'E2E storm watch for Pinar del Río';
const DAY_MS = 86_400_000;

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

interface MailpitMessage {
  ID: string;
  Subject: string;
  To?: { Address: string }[];
}

function midnightPlus(days: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days),
  );
}

/** The advisories this spec created (matched by their headline), and their rows. */
async function cleanup() {
  const rows = await prisma.advisoryTranslation.findMany({
    where: { headline: { startsWith: 'E2E storm watch' } },
    select: { advisoryId: true },
  });
  const ids = [...new Set(rows.map((row) => row.advisoryId))];
  if (ids.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityType: 'Advisory', entityId: { in: ids } },
    });
    await prisma.advisory.updateMany({
      where: { id: { in: ids } },
      data: { supersedesId: null },
    });
    await prisma.advisory.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.reservation.deleteMany({ where: { bookingCode: BOOKING } });
  await prisma.user.deleteMany({ where: { email: OPS_EMAIL } });
}

test.describe('M7 advisories', () => {
  test.beforeAll(async () => {
    await cleanup();
    const traveler = await prisma.user.findUniqueOrThrow({
      where: { email: TRAVELER_EMAIL },
    });
    // A second desk member: a critical advisory needs an Operations Admin as
    // well as the seeded Super Admin.
    await prisma.user.create({
      data: { email: OPS_EMAIL, fullName: 'Ana Ops', role: 'OPERATIONS_ADMIN' },
    });
    const start = midnightPlus(3);
    await prisma.reservation.create({
      data: {
        userId: traveler.id,
        bookingCode: BOOKING,
        startDate: start,
        endDate: new Date(start.getTime() + 5 * DAY_MS),
        status: 'CONFIRMED',
        totalCurrency: 'EUR',
        totalAmount: '900.00',
        serviceItems: {
          create: {
            serviceType: 'ACCOMMODATION',
            status: 'ACCEPTED',
            province: 'Pinar del Río',
            serviceDateStart: start,
            serviceDateEnd: new Date(start.getTime() + 5 * DAY_MS),
          },
        },
      },
    });
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('drafts a critical advisory, publishes it on two people, emails and is acknowledged', async ({
    page,
    browser,
  }) => {
    // The Super Admin drafts it in the Content section.
    await signIn(page);
    await page
      .getByRole('navigation', { name: 'Admin' })
      .getByRole('link', { name: 'Content' })
      .click();
    await expect(page).toHaveURL(/\/content\/advisories$/);
    await page.getByRole('link', { name: 'New advisory' }).click();

    await page.getByRole('radio', { name: /^Critical/ }).check();
    await page.getByRole('checkbox', { name: 'Pinar del Río', exact: true }).check();
    await page.getByLabel('Source (shown to travelers)').fill('Insmet watch');
    await page.locator('#advisory-headline-en').fill(HEADLINE);
    await page
      .locator('#advisory-body-en')
      .fill('Stay at your casa until the watch lifts.');
    // The preview draws the banner as travelers will see it.
    await expect(
      page.getByRole('region', { name: 'Banner preview · as travelers see it' }),
    ).toContainText(HEADLINE);
    for (const [tab, headline] of [
      ['ES', `${HEADLINE} (es)`],
      ['FR', `${HEADLINE} (fr)`],
    ] as const) {
      await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
      const locale = tab.toLowerCase();
      await page.locator(`#advisory-headline-${locale}`).fill(headline);
      await page.locator(`#advisory-body-${locale}`).fill('Quédate en tu casa.');
    }
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page).toHaveURL(/\/content\/advisories\/[0-9a-f-]{36}$/);
    const detailUrl = page.url();

    await page.getByRole('button', { name: 'Approve (1 of 2)' }).click();
    await expect(page.getByText('Awaiting approval', { exact: true })).toBeVisible();
    await expect(page.getByText('Waiting for an Operations Admin.')).toBeVisible();

    // A different person, an Operations Admin, gives the second approval.
    const opsContext = await browser.newContext();
    const ops = await opsContext.newPage();
    await signIn(ops, OPS_EMAIL);
    await ops.goto(detailUrl);
    await ops.getByRole('button', { name: 'Approve & publish (2 of 2)' }).click();
    await expect(ops.getByText('Published', { exact: true })).toBeVisible();
    await expect(ops.getByText(/travelers? emailed/)).toBeVisible();
    await opsContext.close();

    // E-Advisory reached the traveler whose secured trip is in the region.
    let messageId = '';
    await expect(async () => {
      const response = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=200`);
      const { messages } = (await response.json()) as { messages: MailpitMessage[] };
      const mine = messages.filter(
        (message) =>
          message.To?.some((recipient) => recipient.Address === TRAVELER_EMAIL) &&
          message.Subject.includes(HEADLINE),
      );
      expect(mine).toHaveLength(1);
      messageId = mine[0]!.ID;
    }).toPass({ timeout: 20_000 });
    const detail = (await (
      await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`)
    ).json()) as { Subject: string; Text: string };
    expect(detail.Subject).toBe(
      `Travel advisory · ${HEADLINE} · what it means for your trip`,
    );
    expect(detail.Text).toContain('Advisory · critical');
    expect(detail.Text).toContain(BOOKING);
    expect(detail.Text).toContain('Pinar del Río');
    expect(detail.Text).toContain('acknowledge it on the site');

    // The storefront banner shows it on every page; the traveler acknowledges.
    await signIn(page, TRAVELER_EMAIL, {
      origin: STOREFRONT_URL,
      callbackPath: '/en/account',
    });
    const banner = page.getByRole('region', { name: 'Travel advisory' });
    await expect(banner).toContainText(HEADLINE);
    await expect(
      banner.getByRole('button', { name: 'Dismiss this advisory' }),
    ).toHaveCount(0);
    await expect(async () => {
      await banner
        .getByRole('button', { name: 'I understand' })
        .click({ timeout: 2_000 });
      await expect(
        page.getByRole('button', { name: 'Show the critical advisory' }),
      ).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    const advisory = await prisma.advisoryTranslation.findFirstOrThrow({
      where: { headline: HEADLINE },
    });
    const traveler = await prisma.user.findUniqueOrThrow({
      where: { email: TRAVELER_EMAIL },
    });
    await expect
      .poll(() =>
        prisma.advisoryAcknowledgement.count({
          where: { advisoryId: advisory.advisoryId, userId: traveler.id },
        }),
      )
      .toBe(1);

    // Acknowledged, it starts collapsed on the next page; Travel info lists it.
    await page.goto(`${STOREFRONT_URL}/en/travel-info`);
    await expect(
      page.getByRole('button', { name: 'Show the critical advisory' }),
    ).toBeVisible();
    const current = page.locator('#advisories');
    await expect(current.getByText(HEADLINE, { exact: true })).toBeVisible();
    await expect(current).toContainText('Source: Insmet watch');
  });
});

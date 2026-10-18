import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const TRAVELER_EMAIL = 'traveler@example.test';
const BOOKING = 'E2EDIS01';
const TITLE = 'E2E outage in Viñales';
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

/** The cases this spec opened (matched by their title), their log, and the booking. */
async function cleanup() {
  const cases = await prisma.disruptionCase.findMany({
    where: { title: { startsWith: 'E2E outage' } },
    select: { id: true },
  });
  const ids = cases.map((row) => row.id);
  if (ids.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityType: 'DisruptionCase', entityId: { in: ids } },
    });
    await prisma.disruptionCase.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.reservation.deleteMany({ where: { bookingCode: BOOKING } });
}

test.describe('M8 disruptions', () => {
  let reservationId = '';

  test.beforeAll(async () => {
    await cleanup();
    const traveler = await prisma.user.findUniqueOrThrow({
      where: { email: TRAVELER_EMAIL },
    });
    // A trip under way in Pinar del Río: the case suggests it and the traveler
    // is on the ground.
    const start = midnightPlus(-1);
    const reservation = await prisma.reservation.create({
      data: {
        userId: traveler.id,
        bookingCode: BOOKING,
        startDate: start,
        endDate: new Date(start.getTime() + 5 * DAY_MS),
        status: 'IN_PROGRESS',
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
    reservationId = reservation.id;
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('opens a case, sends the options, the traveler chooses and the desk sees it', async ({
    page,
  }) => {
    await signIn(page);
    await page
      .getByRole('navigation', { name: 'Admin' })
      .getByRole('link', { name: 'Disruptions' })
      .click();
    await expect(page).toHaveURL(/\/disruptions$/);
    await page.getByRole('link', { name: 'New case' }).click();

    await page.getByRole('radio', { name: /^Power outage > 12 h/ }).check();
    await page.getByRole('radio', { name: /^Major/ }).check();
    await page
      .getByLabel('Province', { exact: true })
      .selectOption({ label: 'Pinar del Río' });
    await page.getByLabel('Title', { exact: true }).fill(TITLE);
    await page
      .getByLabel('Summary', { exact: true })
      .fill('Province-wide outage since last night.');
    await page.getByRole('button', { name: 'Open case' }).click();
    await expect(page).toHaveURL(/\/disruptions\/[0-9a-f-]{36}$/);
    const caseUrl = page.url();

    // The playbook and the options were copied from the scenario.
    await expect(
      page.getByText('Confirm safety and location of every traveler on site'),
    ).toBeVisible();
    // The trip under way in the province is suggested; attach it by code.
    await expect(page.getByRole('checkbox', { name: new RegExp(BOOKING) })).toBeVisible();
    await page.getByLabel('Booking code', { exact: true }).fill(BOOKING);
    await page.getByRole('button', { name: 'Attach by code' }).click();
    const row = page.getByRole('row', { name: new RegExp(BOOKING) });
    await expect(row).toContainText('Unknown');
    await expect(row).toContainText('Options not sent');

    await page.getByRole('button', { name: 'Send options to 1 booking' }).click();
    await expect(row).toContainText('Awaiting');

    // E-Options reached the traveler, with every option and the default.
    let messageId = '';
    await expect(async () => {
      const response = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=200`);
      const { messages } = (await response.json()) as { messages: MailpitMessage[] };
      const mine = messages.filter(
        (message) =>
          message.To?.some((recipient) => recipient.Address === TRAVELER_EMAIL) &&
          message.Subject.includes(TITLE),
      );
      expect(mine).toHaveLength(1);
      messageId = mine[0]!.ID;
    }).toPass({ timeout: 20_000 });
    const detail = (await (
      await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`)
    ).json()) as { Subject: string; Text: string };
    expect(detail.Subject).toContain("choose how you'd like to continue by");
    expect(detail.Text).toContain(`${BOOKING} · case DC-`);
    expect(detail.Text).toContain('A · Stay at the casa with the generator windows');
    expect(detail.Text).toContain('we keep option A and the desk calls you');
    expect(detail.Text).toContain(
      `/account/reservations/${reservationId}#disruption-options`,
    );

    // The traveler chooses on the trip page, behind sign-in.
    await signIn(page, TRAVELER_EMAIL, {
      origin: STOREFRONT_URL,
      callbackPath: `/en/account/reservations/${reservationId}`,
    });
    const card = page.locator('#disruption-options');
    await expect(card).toContainText(TITLE);
    await expect(card).toContainText('If we hear nothing by');
    await expect(async () => {
      await card.getByRole('radio', { name: /^B ·/ }).check({ timeout: 2_000 });
      await card
        .getByRole('button', { name: 'Confirm option B' })
        .click({ timeout: 2_000 });
      await expect(card.getByText('You chose option B.', { exact: false })).toBeVisible({
        timeout: 4_000,
      });
    }).toPass({ timeout: 20_000 });

    // The desk sees the answer on the status board and in the case log.
    await signIn(page);
    await page.goto(caseUrl);
    await expect(page.getByRole('row', { name: new RegExp(BOOKING) })).toContainText(
      'Option B · chosen online',
    );
    await expect(
      page.getByText(`recorded option B for ${BOOKING} (chosen online)`),
    ).toBeVisible();
  });
});

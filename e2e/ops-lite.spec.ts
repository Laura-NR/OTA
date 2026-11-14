import { PrismaClient } from '@ota/db';
import { zonedCalendarDay } from '@ota/domain';
import { expect, test, type Page } from '@playwright/test';

import { createDispatchableReservation, deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();
const RED = 'E2ELITE1';
const THREAD = 'E2ELITE2';
const HOUR = 60 * 60 * 1000;

/** A guide offer that timed out 20 minutes ago: a red alert on the desk and in Ops Lite. */
async function timedOut(bookingCode: string): Promise<string> {
  const { reservation, serviceItem } = await createDispatchableReservation(
    prisma,
    bookingCode,
  );
  const guide = await prisma.supplierProfile.findFirstOrThrow({
    where: { user: { email: 'guide@example.test' } },
    select: { id: true },
  });
  const deadline = new Date(Date.now() - 20 * 60 * 1000);
  await prisma.reservation.update({
    where: { id: reservation.id },
    data: { status: 'ACTION_REQUIRED' },
  });
  await prisma.serviceItem.update({
    where: { id: serviceItem.id },
    data: {
      status: 'TIMEOUT',
      supplierId: guide.id,
      offeredAt: new Date(deadline.getTime() - 2 * HOUR),
      dispatchDeadline: deadline,
    },
  });
  return serviceItem.id;
}

/** The red card of a booking, opened. */
async function openRedCard(page: Page, bookingCode: string) {
  const card = page.locator('section').filter({ hasText: bookingCode });
  const toggle = card.getByRole('button', { name: /Guide timed out/ });
  await expect(async () => {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click({ timeout: 1_000 });
    }
    await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 1_000 });
  }).toPass();
  return card;
}

/**
 * Ops Lite (AL-*, Phase 7 item 2) on a 390 px phone: a red alert
 * acknowledged and re-dispatched from the alert's card, both logged as Ops
 * Lite; the pipeline's states and today's movements; an unread thread
 * opened, marked read and answered; and the desk pointing a phone to Ops
 * Lite.
 */
test.describe.serial('Ops Lite on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test.afterAll(async () => {
    await deleteReservationFixture(prisma, RED);
    await deleteReservationFixture(prisma, THREAD);
    await prisma.$disconnect();
  });

  test('a red alert is acknowledged and re-dispatched from its card, logged as Ops Lite', async ({
    page,
  }) => {
    const itemId = await timedOut(RED);
    await page.goto('/lite/alerts');
    await expect(page.getByRole('heading', { name: 'Ops Lite · Alerts' })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Ops Lite' })
        .getByRole('link', { name: /^Alerts/ }),
    ).toHaveAttribute('aria-current', 'page');

    const card = await openRedCard(page, RED);
    await expect(card.getByText(/red since \d\d:\d\d · audio every 60 s/)).toBeVisible();

    // Acknowledging stops the cue with the desk's 6 s undo, then is recorded as Ops Lite's.
    const toast = page
      .getByRole('status')
      .filter({ hasText: `Alert acknowledged · audio off for ${RED}` });
    await expect(async () => {
      await card
        .getByRole('button', { name: 'Acknowledge · stop the audio' })
        .click({ timeout: 1_000 });
      await expect(toast).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await expect(toast).toBeHidden({ timeout: 10_000 });
    await expect
      .poll(async () =>
        (
          await prisma.auditLog.findMany({
            where: { action: 'dispatch.alert_acknowledged', entityId: itemId },
            select: { metadata: true },
          })
        ).map((row) => (row.metadata as { channel?: string }).channel),
      )
      .toEqual(['ops_lite']);
    await expect(card.getByText(/acknowledged by .+ · \d\d:\d\d/)).toBeVisible();

    // Re-dispatch lists the qualified workers in the card; the offer goes out as Ops Lite's.
    await card.getByRole('button', { name: 'Re-dispatch · pick a fallback' }).click();
    const offer = card.getByRole('button', { name: /^Offer to / }).first();
    await expect(offer).toBeVisible();
    await offer.click();
    await expect(
      page.locator('strong', { hasText: /^Offered to .+ · \d\d:\d\d$/ }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        (
          await prisma.auditLog.findMany({
            where: { action: 'dispatch.reassign', entityId: itemId },
            select: { metadata: true },
          })
        ).map((row) => (row.metadata as { channel?: string }).channel),
      )
      .toEqual(['ops_lite']);
    expect(
      (await prisma.serviceItem.findUniqueOrThrow({ where: { id: itemId } })).status,
    ).toBe('OFFERED');
  });

  test('the pipeline shows today’s arrival; an unread thread is opened, read and answered', async ({
    page,
  }) => {
    const { reservation } = await createDispatchableReservation(prisma, THREAD);
    const today = zonedCalendarDay(new Date());
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        status: 'CONFIRMED',
        startDate: today,
        endDate: new Date(today.getTime() + 4 * 24 * HOUR),
      },
    });
    await prisma.message.deleteMany({ where: { reservationId: reservation.id } });
    await prisma.message.create({
      data: {
        reservationId: reservation.id,
        sender: 'TRAVELER',
        body: 'Is the pickup still at 16:35?',
      },
    });

    await page.goto('/lite/pipeline');
    await expect(
      page.getByRole('heading', { name: 'Ops Lite · Pipeline' }),
    ).toBeVisible();
    await expect(page.getByText(`start their trip · ${THREAD}`)).toBeVisible();
    const confirmed = page.getByRole('button', { name: /^CONFIRMED\s*\d+$/ });
    await expect(async () => {
      await confirmed.click({ timeout: 1_000 });
      await expect(confirmed).toHaveAttribute('aria-expanded', 'true', {
        timeout: 1_000,
      });
    }).toPass();
    await expect(page.getByText('Documents issued · the trip is ahead')).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Ops Lite' })
      .getByRole('link', { name: /^Inbox/ })
      .click();
    await expect(page.getByRole('heading', { name: 'Ops Lite · Inbox' })).toBeVisible();
    const thread = page.getByRole('button').filter({ hasText: THREAD });
    await expect(thread.getByText('New')).toBeVisible();
    await expect(async () => {
      await thread.click({ timeout: 1_000 });
      await expect(thread).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
    }).toPass();
    await expect(
      page
        .getByRole('list', { name: 'Messages' })
        .getByText('Is the pickup still at 16:35?'),
    ).toBeVisible();

    // Opening the thread marks the traveler's message read for the desk.
    await expect
      .poll(async () =>
        prisma.message.count({
          where: { reservationId: reservation.id, sender: 'TRAVELER', readAt: null },
        }),
      )
      .toBe(0);

    await page
      .getByRole('textbox', { name: 'Reply' })
      .fill('Yes, Reinier meets you at T3.');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(
      page
        .getByRole('list', { name: 'Messages' })
        .getByText('Yes, Reinier meets you at T3.'),
    ).toBeVisible();
    expect(
      await prisma.message.count({
        where: { reservationId: reservation.id, sender: 'OPERATIONS' },
      }),
    ).toBe(1);
  });

  test('the desk points a phone to Ops Lite, and a wide screen not', async ({ page }) => {
    await page.goto('/dashboard');
    const pointer = page.getByRole('link', { name: /Open Ops Lite/ });
    await expect(pointer).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(pointer).toBeHidden();
  });
});

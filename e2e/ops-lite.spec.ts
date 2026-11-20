import { PrismaClient } from '@ota/db';
import { zonedCalendarDay } from '@ota/domain';
import { expect, test, type Page } from '@playwright/test';

import { createDispatchableReservation, deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();
const RED = 'E2ELITE1';
const THREAD = 'E2ELITE2';
const REFUND = 'E2ELITE3';
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
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

/**
 * A paid € 1,000 booking with a € 600 goodwill refund the signed-in Super
 * Admin already approved: between the € 500 and € 2,000 limits, it waits on a
 * second, different approver.
 */
async function refundAwaitingSecond(bookingCode: string): Promise<string> {
  const { reservation } = await createDispatchableReservation(prisma, bookingCode);
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@example.test' },
    select: { id: true },
  });
  const receipt = await prisma.paymentReceipt.create({
    data: {
      reservationId: reservation.id,
      rail: 'OPEN_BANKING_SEPA',
      amount: '1000.00',
      status: 'PAID',
    },
  });
  const refund = await prisma.refund.create({
    data: {
      reservationId: reservation.id,
      receiptId: receipt.id,
      amount: '600.00',
      reason: 'GOODWILL',
      note: 'E2E gesture',
      requestedById: admin.id,
      approvals: { create: { approverId: admin.id, approve: true } },
    },
  });
  return refund.id;
}

/** The newest Mailpit message to `email` whose subject holds `text`, waiting for it. */
async function mailTo(email: string, text: string): Promise<{ Subject: string }> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=200`);
    const { messages } = (await response.json()) as {
      messages: { Subject: string; To?: { Address: string }[] }[];
    };
    const found = messages.find(
      (message) =>
        message.Subject.includes(text) &&
        message.To?.some((recipient) => recipient.Address === email),
    );
    if (found) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email to ${email} about ${text}`);
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
 * opened, marked read and answered; a refund you approved nudged and
 * withdrawn; and the desk pointing a phone to Ops Lite.
 */
test.describe.serial('Ops Lite on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test.afterAll(async () => {
    await deleteReservationFixture(prisma, RED);
    await deleteReservationFixture(prisma, THREAD);
    await deleteReservationFixture(prisma, REFUND);
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

  test('a refund you approved: nudge the other approvers by email, then withdraw', async ({
    page,
  }) => {
    const refundId = await refundAwaitingSecond(REFUND);
    await page.goto('/lite/alerts');
    const card = page.locator('section').filter({ hasText: REFUND });
    await expect(
      card.getByRole('heading', { name: 'Refund €600 · needs approval' }),
    ).toBeVisible();
    await expect(
      card.getByText('You approved. Another approver must give the next one'),
    ).toBeVisible();
    // Your vote is in, so the card no longer offers one.
    await expect(card.getByRole('button', { name: 'Approve' })).toHaveCount(0);

    const nudge = card.getByRole('button', { name: 'Nudge by email' });
    await expect(async () => {
      await nudge.click({ timeout: 1_000 });
      await expect(card.getByText(/^Emailed .+ at \d\d:\d\d\./)).toBeVisible({
        timeout: 2_000,
      });
    }).toPass();
    // The other seeded Super Admin is asked, in the email's own words.
    expect((await mailTo('founder@example.test', REFUND)).Subject).toMatch(
      new RegExp(`${REFUND}`),
    );
    // One nudge per cooldown: the button stays, saying when it can go again.
    await expect(nudge).toHaveAttribute('aria-disabled', 'true');
    await expect(card.getByText(/^Nudged; again from \d\d:\d\d$/)).toBeVisible();

    await card.getByRole('button', { name: 'Withdraw my approval' }).click();
    const dialog = page.getByRole('dialog', { name: 'Withdraw your approval?' });
    await expect(dialog).toContainText(`The refund of €600.00 on ${REFUND}`);
    await dialog.getByRole('button', { name: 'Withdraw approval' }).click();
    await expect(dialog).toBeHidden();
    await expect(card.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Nudge by email' })).toHaveCount(0);

    expect(await prisma.refundApproval.count({ where: { refundId } })).toBe(0);
    const actions = await prisma.auditLog.findMany({
      where: { metadata: { path: ['refundId'], equals: refundId } },
      select: { action: true },
    });
    expect(actions.map((row) => row.action).sort()).toEqual([
      'refund.approval_withdrawn',
      'refund.nudged',
    ]);
  });

  test('the desk points a phone to Ops Lite, and a wide screen not', async ({ page }) => {
    await page.goto('/dashboard');
    const pointer = page.getByRole('link', { name: /Open Ops Lite/ });
    await expect(pointer).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(pointer).toBeHidden();
  });
});

import { PrismaClient } from '@ota/db';
import { expect, test, type Page } from '@playwright/test';

import { createDispatchableReservation, deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();
const ACKED = 'E2EACK01';
const LATER = 'E2EACK02';
const ELSEWHERE = 'E2EACK03';
const SUPPORT = 'alerts-e2e-support@example.test';
const HOUR = 60 * 60 * 1000;

/** When this spec started: its mute entries are the desk's newer ones. */
const started = new Date();

/** Record each cue the desk plays (`ota:alert-cue`) before the page loads. */
async function recordCues(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const scope = window as typeof window & { __cues?: string[] };
    scope.__cues = [];
    window.addEventListener('ota:alert-cue', (event) => {
      scope.__cues?.push(String((event as CustomEvent).detail));
    });
  });
}

function cues(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as typeof window & { __cues?: string[] }).__cues ?? [],
  );
}

/** A guide offer that timed out `minutesAgo` minutes ago: a red alert from then. */
async function timedOut(bookingCode: string, minutesAgo: number) {
  const { reservation, serviceItem } = await createDispatchableReservation(
    prisma,
    bookingCode,
  );
  const guide = await prisma.supplierProfile.findFirstOrThrow({
    where: { user: { email: 'guide@example.test' } },
    select: { id: true },
  });
  const deadline = new Date(Date.now() - minutesAgo * 60 * 1000);
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

async function deleteSupport(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: SUPPORT },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: users.map((user) => user.id) } },
  });
  await prisma.user.deleteMany({ where: { email: SUPPORT } });
}

async function clearMutes(): Promise<void> {
  await prisma.auditLog.deleteMany({
    where: { entityType: 'DispatchDesk', createdAt: { gte: started } },
  });
}

/**
 * A-A11y 01's audio channel and the desk's acknowledgement (owner decision
 * 2026-10-29: per desk, audited): the cue starts after the first interaction,
 * `A` acknowledges the focused row with a 6 s undo before the audit row is
 * written, and "Mute 15 min" is logged with the actor and never silences a
 * red alert raised after it.
 */
test.describe.serial('desk alert cue, acknowledgement and mute', () => {
  test.beforeEach(async ({ page }) => {
    await clearMutes();
    await recordCues(page);
    await signIn(page);
  });

  test.afterAll(async () => {
    await clearMutes();
    await deleteReservationFixture(prisma, ACKED);
    await deleteReservationFixture(prisma, LATER);
    await deleteReservationFixture(prisma, ELSEWHERE);
    await deleteSupport();
    await prisma.$disconnect();
  });

  test('a red alert sounds once sound is on; A acknowledges it with an undo, then for the desk', async ({
    page,
  }) => {
    const itemId = await timedOut(ACKED, 20);
    await page.goto('/dashboard');
    const matrix = page.getByRole('region', { name: 'Dispatch matrix' });
    const row = matrix.getByRole('row').filter({ hasText: ACKED });
    await expect(
      page.getByText(/^The audio cue repeats every 60 s until each red alert/),
    ).toBeVisible();

    // No autoplay: the cue waits for the first interaction.
    const turnOn = page.getByRole('button', { name: 'Turn on sound' });
    await expect(turnOn).toBeVisible();
    expect(await cues(page)).toEqual([]);
    await expect(async () => {
      await turnOn.click({ timeout: 1_000 });
      await expect(turnOn).toBeHidden({ timeout: 1_000 });
    }).toPass();
    await expect.poll(() => cues(page)).toContain('RED');

    // A on the focused row acknowledges it here at once, with an undo.
    const bookingLink = row.getByRole('rowheader').getByRole('link', { name: ACKED });
    const acknowledge = row.getByRole('button', {
      name: `Acknowledge red alert · ${ACKED}`,
    });
    const toast = page.getByRole('status').filter({
      hasText: `Alert acknowledged · audio off for ${ACKED}`,
    });
    await bookingLink.focus();
    await page.keyboard.press('a');
    await expect(toast).toBeVisible();
    await expect(row.getByText('Acknowledged · undo still possible')).toBeVisible();
    await expect(acknowledge).toBeHidden();
    await expect(bookingLink).toBeFocused();

    // Undo puts it back; nothing was recorded.
    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect(toast).toBeHidden();
    await expect(acknowledge).toBeVisible();
    expect(
      await prisma.auditLog.count({
        where: { action: 'dispatch.alert_acknowledged', entityId: itemId },
      }),
    ).toBe(0);

    // The button does the same; once the undo runs out the desk records it.
    await acknowledge.click();
    await expect(toast).toBeVisible();
    await expect(toast).toBeHidden({ timeout: 10_000 });
    await expect(row.getByText(/^Acknowledged · .+ · \d\d:\d\d$/)).toBeVisible();
    const rows = await prisma.auditLog.findMany({
      where: { action: 'dispatch.alert_acknowledged', entityId: itemId },
      select: { actor: { select: { email: true } } },
    });
    expect(rows).toEqual([{ actor: { email: 'admin@example.test' } }]);

    // It is the desk's: a fresh page shows it acknowledged, and it stays quiet.
    await page.reload();
    await expect(row.getByText(/^Acknowledged · .+ · \d\d:\d\d$/)).toBeVisible();
    await expect(acknowledge).toBeHidden();
  });

  test('Mute 15 min is logged with the actor and never silences a newer red alert', async ({
    page,
  }) => {
    await deleteReservationFixture(prisma, ACKED);
    await timedOut(ACKED, 20);
    await page.goto('/dashboard');

    const mute = page.getByRole('button', { name: 'Mute 15 min' });
    await expect(async () => {
      await mute.click({ timeout: 1_000 });
      await expect(page.getByText(/^Audio muted until \d\d:\d\d by /)).toBeVisible({
        timeout: 1_000,
      });
    }).toPass();
    await expect(
      page.getByText(
        /\(logged\)\. Visual alerts stay on; the mute never applies to a new red alert\./,
      ),
    ).toBeVisible();
    const muted = await prisma.auditLog.findMany({
      where: { action: 'dispatch.alerts_muted', createdAt: { gte: started } },
      select: { actor: { select: { email: true } } },
    });
    expect(muted).toEqual([{ actor: { email: 'admin@example.test' } }]);

    // The red alert raised before the mute stays silent once sound is on…
    await page.reload();
    await page.getByRole('button', { name: 'Turn on sound' }).click();
    await page.waitForTimeout(2_500);
    expect(await cues(page)).toEqual([]);

    // …but one raised after it sounds.
    await timedOut(LATER, 0);
    await page.reload();
    await expect(
      page.getByRole('region', { name: 'Dispatch matrix' }).getByText(LATER, {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Turn on sound' }).click();
    await expect.poll(() => cues(page)).toContain('RED');

    // Unmute, logged too.
    await page.getByRole('button', { name: 'Unmute' }).click();
    await expect(
      page.getByText(/^The audio cue repeats every 60 s until each red alert/),
    ).toBeVisible();
    expect(
      await prisma.auditLog.count({
        where: { action: 'dispatch.alerts_unmuted', createdAt: { gte: started } },
      }),
    ).toBe(1);
  });

  test('a red alert follows the desk to other pages, which acknowledge it too', async ({
    page,
  }) => {
    const itemId = await timedOut(ELSEWHERE, 20);
    await page.goto('/payments');
    const nav = page.getByRole('navigation', { name: 'Admin' });
    const strip = page.getByText(new RegExp(`^\\d+ red alerts? · .*${ELSEWHERE}`));
    await expect(strip).toBeVisible();
    await expect(page.getByRole('region', { name: 'Dispatch matrix' })).toHaveCount(0);

    // The cue starts after the first interaction here as on the dashboard…
    const turnOn = page.getByRole('button', { name: 'Turn on sound' });
    await expect(async () => {
      await turnOn.click({ timeout: 1_000 });
      await expect(turnOn).toBeHidden({ timeout: 1_000 });
    }).toPass();
    await expect.poll(() => cues(page)).toContain('RED');
    const played = (await cues(page)).length;

    // …and moving around the desk keeps the sound on without replaying the alert.
    await nav.getByRole('link', { name: 'Bookings' }).click();
    await expect(page).toHaveURL(/\/bookings$/);
    await expect(strip).toBeVisible();
    await expect(turnOn).toBeHidden();
    await page.waitForTimeout(2_500);
    expect(await cues(page)).toHaveLength(played);

    // The strip acknowledges the booking; the undo survives a page change.
    const acknowledge = page.getByRole('button', {
      name: `Acknowledge red alert · ${ELSEWHERE}`,
    });
    const toast = page.getByRole('status').filter({
      hasText: `Alert acknowledged · audio off for ${ELSEWHERE}`,
    });
    await acknowledge.click();
    await expect(toast).toBeVisible();
    await expect(acknowledge).toBeHidden();
    await expect(page.locator('#main')).toBeFocused();
    await nav.getByRole('link', { name: 'Payments' }).click();
    await expect(page).toHaveURL(/\/payments$/);
    await expect(toast).toBeVisible();
    await expect(toast).toBeHidden({ timeout: 10_000 });
    await expect
      .poll(() =>
        prisma.auditLog.count({
          where: { action: 'dispatch.alert_acknowledged', entityId: itemId },
        }),
      )
      .toBe(1);

    // "Go to matrix" leads to the dashboard, which draws the strip once.
    await page.getByRole('link', { name: 'Go to matrix' }).click();
    await expect(page).toHaveURL(/\/dashboard#matrix$/);
    await expect(page.getByRole('link', { name: 'Go to matrix' })).toHaveCount(1);
    const row = page
      .getByRole('region', { name: 'Dispatch matrix' })
      .getByRole('row')
      .filter({ hasText: ELSEWHERE });
    await expect(row.getByText(/^Acknowledged · .+ · \d\d:\d\d$/)).toBeVisible();
  });

  test('support sees the alert on every page but cannot acknowledge or mute', async ({
    browser,
  }) => {
    await deleteReservationFixture(prisma, ELSEWHERE);
    await timedOut(ELSEWHERE, 20);
    await deleteSupport();
    await prisma.user.create({
      data: {
        email: SUPPORT,
        fullName: 'E2E Alerts Support',
        role: 'ADMINISTRATIVE_SUPPORT',
      },
    });
    const context = await browser.newContext({ baseURL: 'http://localhost:3002' });
    const support = await context.newPage();
    await signIn(support, SUPPORT, { callbackPath: '/payments' });
    await expect(
      support.getByText(new RegExp(`^\\d+ red alerts? · .*${ELSEWHERE}`)),
    ).toBeVisible();
    await expect(support.getByRole('link', { name: 'Go to matrix' })).toBeVisible();
    await expect(
      support.getByRole('button', { name: `Acknowledge red alert · ${ELSEWHERE}` }),
    ).toHaveCount(0);
    await expect(support.getByRole('button', { name: 'Mute 15 min' })).toHaveCount(0);
    await context.close();
  });
});

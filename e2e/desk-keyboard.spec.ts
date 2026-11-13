import { PrismaClient } from '@ota/db';
import { expect, test, type Page } from '@playwright/test';

import { createDispatchableReservation, deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();
const BOOKING_CODE = 'E2EKBD01';

/**
 * A-A11y's desk keyboard paths and screen-reader announcements, the checks axe
 * cannot decide: the skip link, the shortcut list and its off switch, the
 * typing guard, `G` then a letter, `R` on a matrix row with focus on the
 * panel's title and back, the one-time announcement of a threshold crossing,
 * and an unavailable action that keeps its focus and says why.
 */
test.describe('desk keyboard paths (A-A11y)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test.afterAll(async () => {
    await deleteReservationFixture(prisma, BOOKING_CODE);
    await prisma.$disconnect();
  });

  /** The focused element's accessible text, for asserting where focus went. */
  function focusedText(page: Page): Promise<string> {
    return page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      return (element?.getAttribute('aria-label') ?? element?.textContent ?? '').trim();
    });
  }

  test('the skip link is the first stop and moves focus to the page', async ({
    page,
  }) => {
    await page.goto('/bookings');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  test('shortcuts: the list, G then a letter, the typing guard and the off switch', async ({
    page,
  }) => {
    await page.goto('/bookings/new');
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    const opener = page.getByRole('button', { name: 'Keyboard shortcuts' });

    // "?" opens the list (retried until hydration attaches the listener); Esc
    // closes it and focus goes back.
    await expect(async () => {
      await opener.focus();
      await page.keyboard.press('?');
      await expect(help).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await expect(help.getByRole('rowheader', { name: 'G then D' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
    await expect(opener).toBeFocused();

    // A typed "g" then "d" in a field stays text.
    const email = page.getByLabel('Traveler email');
    await email.pressSequentially('gd');
    await expect(email).toHaveValue('gd');
    await expect(page).toHaveURL(/\/bookings\/new$/);
    await opener.focus();

    // G then D goes to the dashboard.
    await page.keyboard.press('g');
    await page.keyboard.press('d');
    await expect(page).toHaveURL(/\/dashboard$/);

    // Off on this device: the keys do nothing until they are switched back on.
    await opener.click();
    const toggle = help.getByRole('switch', { name: 'Single-key shortcuts' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Escape');
    await opener.focus();
    await page.keyboard.press('g');
    await page.keyboard.press('b');
    await page.keyboard.press('?');
    await expect(help).toBeHidden();
    await expect(page).toHaveURL(/\/dashboard$/);

    // The choice outlives a reload on this device.
    await page.reload();
    await expect(async () => {
      await opener.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false', { timeout: 1_000 });
    }).toPass();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  test('a threshold crossing is announced once, and R opens re-dispatch for the focused row', async ({
    page,
  }) => {
    const { reservation, serviceItem } = await createDispatchableReservation(
      prisma,
      BOOKING_CODE,
    );
    const guide = await prisma.supplierProfile.findFirstOrThrow({
      where: { user: { email: 'guide@example.test' } },
      select: { id: true },
    });
    // Amber now (well past 75 % of a 2 h timer), red about 30 s later.
    const now = Date.now();
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: 'DISPATCH_IN_PROGRESS' },
    });
    await prisma.serviceItem.update({
      where: { id: serviceItem.id },
      data: {
        status: 'OFFERED',
        supplierId: guide.id,
        offeredAt: new Date(now - 2 * 60 * 60 * 1000),
        dispatchDeadline: new Date(now + 30_000),
      },
    });

    await page.goto('/dashboard');
    const matrix = page.getByRole('region', { name: 'Dispatch matrix' });
    const row = matrix.getByRole('row').filter({ hasText: BOOKING_CODE });
    await expect(row.getByRole('rowheader')).toContainText(BOOKING_CODE);
    await expect(
      row.getByRole('button', { name: `Re-dispatch Guide · ${BOOKING_CODE}` }),
    ).toBeVisible();
    await expect(row.getByRole('link', { name: `Open ${BOOKING_CODE}` })).toBeVisible();

    // Amber at load is the starting point, not news; the turn to red is announced once.
    const assertive = page.locator('main [role="alert"].sr-only');
    await expect(assertive).toHaveText('');
    await expect(assertive).toHaveText(
      new RegExp(
        `^Red alert\\. Booking ${BOOKING_CODE}: Guide, .+, timed out at \\d\\d:\\d\\d\\. Press R to re-dispatch\\.$`,
      ),
      { timeout: 60_000 },
    );

    // R with focus in the row opens its panel on the title; Esc gives focus back.
    const bookingLink = row
      .getByRole('rowheader')
      .getByRole('link', { name: BOOKING_CODE });
    const panel = page.getByRole('dialog', {
      name: new RegExp(`^Re-dispatch Guide · ${BOOKING_CODE}`),
    });
    await expect(async () => {
      await bookingLink.focus();
      await page.keyboard.press('r');
      await expect(panel).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await expect(panel.getByRole('heading', { level: 2 })).toBeFocused();
    expect(await focusedText(page)).toMatch(
      new RegExp(`^Re-dispatch Guide · ${BOOKING_CODE}`),
    );
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(bookingLink).toBeFocused();
  });

  test('an unavailable action stays focusable and says why', async ({ page }) => {
    await page.goto('/disruptions/new');
    const open = page.getByRole('button', { name: 'Open case' });
    await expect(open).toHaveAttribute('aria-disabled', 'true');
    await expect(open).not.toHaveAttribute('disabled');
    await expect(open).toHaveAccessibleDescription(
      'Choose a scenario and fill in the title and summary first.',
    );
    await open.focus();
    await expect(open).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/disruptions\/new$/);
  });
});

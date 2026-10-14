import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { createDispatchableReservation, deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();
const BOOKING_CODE = 'E2EDSP01';

test.describe('dispatch from the dashboard', () => {
  let serviceItemId = '';

  test.beforeEach(async ({ page }) => {
    const { serviceItem } = await createDispatchableReservation(prisma, BOOKING_CODE);
    serviceItemId = serviceItem.id;
    await signIn(page);
  });

  test.afterEach(async () => {
    await deleteReservationFixture(prisma, BOOKING_CODE);
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('starts a submitted booking from the desk tasks and re-dispatches a decline', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    const task = page
      .getByRole('listitem')
      .filter({ hasText: `Ready to dispatch · ${BOOKING_CODE}` });
    const matrix = page.getByRole('region', { name: 'Dispatch matrix' });
    const row = matrix.getByRole('row').filter({ hasText: BOOKING_CODE });

    // Client components: retry until hydration attaches the handlers.
    await expect(async () => {
      await task.getByRole('button', { name: 'Start dispatch' }).click();
      await expect(row.getByRole('link', { name: BOOKING_CODE })).toBeVisible({
        timeout: 3_000,
      });
    }).toPass({ timeout: 30_000 });

    await expect(row.getByText(/^Offered · /)).toBeVisible();
    await expect(row.getByText(/^Example Guide/)).toBeVisible();

    // The worker declines (written directly, as the worker app would): red.
    await prisma.serviceItem.update({
      where: { id: serviceItemId },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    await page.reload();
    await expect(row.getByText('Declined', { exact: true })).toBeVisible();

    const panel = page.getByRole('dialog', {
      name: new RegExp(`^Re-dispatch Guide · ${BOOKING_CODE}`),
    });
    await expect(async () => {
      await row.getByRole('button', { name: 'Re-dispatch' }).click();
      await expect(panel).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    // The only seeded guide was already offered this service.
    await expect(
      panel.getByText('No other qualified worker is free for this service right now.'),
    ).toBeVisible();
  });
});

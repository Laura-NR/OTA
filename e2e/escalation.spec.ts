import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { createDispatchableReservation, deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();
const BOOKING_CODE = 'E2EESC01';

test.describe('operations dashboard (live desk)', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('shows the figures and connects the /ops socket', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard');

    await expect(
      page.getByRole('heading', { name: 'Operations dashboard', level: 1 }),
    ).toBeVisible();
    const figures = page.getByRole('region', { name: 'Key figures' });
    await expect(
      figures.getByText('Pending confirmations · by age', { exact: true }),
    ).toBeVisible();
    await expect(figures.getByText('Alerts right now', { exact: true })).toBeVisible();
    await expect(page.getByText('Live', { exact: true })).toBeVisible();
  });

  test('adds a booking to the matrix when its dispatch starts', async ({ page }) => {
    const { reservation } = await createDispatchableReservation(prisma, BOOKING_CODE);

    try {
      await signIn(page);
      await page.goto('/dashboard');
      // The event is published to connected sockets, so connect before firing.
      await expect(page.getByText('Live', { exact: true })).toBeVisible();

      const response = await page.request.post(
        `/api/ota/reservations/${reservation.id}/dispatch`,
      );
      expect(response.ok()).toBe(true);

      // No reload: the live matrix gains the booking and its offered worker.
      const matrix = page.getByRole('region', { name: 'Dispatch matrix' });
      const row = matrix.getByRole('row').filter({ hasText: BOOKING_CODE });
      await expect(row.getByRole('link', { name: BOOKING_CODE })).toBeVisible();
      await expect(row.getByText(/^Example Guide/)).toBeVisible();
    } finally {
      await deleteReservationFixture(prisma, BOOKING_CODE);
    }
  });
});

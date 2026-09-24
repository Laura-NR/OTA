import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { createDispatchableReservation, deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();
const BOOKING_CODE = 'E2EESC01';

test.describe('operations escalation', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('opens the live desk and connects the /ops socket', async ({ page }) => {
    await signIn(page);
    await page.goto('/escalation');

    await expect(page.getByRole('heading', { name: 'Escalation' })).toBeVisible();
    await expect(page.getByText('socket connected')).toBeVisible();
  });

  test('receives a live dispatch event over the /ops socket', async ({ page }) => {
    const { reservation } = await createDispatchableReservation(prisma, BOOKING_CODE);

    try {
      await signIn(page);
      await page.goto('/escalation');
      // The event is published to connected sockets, so connect before firing.
      await expect(page.getByText('socket connected')).toBeVisible();

      const response = await page.request.post(
        `/api/ota/reservations/${reservation.id}/dispatch`,
      );
      expect(response.ok()).toBe(true);

      // No reload: the live board gains the event and the reservation card.
      await expect(page.getByText('dispatch.offer')).toBeVisible();
      await expect(page.getByText(BOOKING_CODE)).toBeVisible();
    } finally {
      await deleteReservationFixture(prisma, BOOKING_CODE);
    }
  });
});

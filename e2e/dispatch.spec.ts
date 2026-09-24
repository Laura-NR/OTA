import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { createDispatchableReservation, deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();
const BOOKING_CODE = 'E2EDSP01';

test.describe('dispatch engine', () => {
  let reservationId = '';

  test.beforeEach(async ({ page }) => {
    const { reservation } = await createDispatchableReservation(prisma, BOOKING_CODE);
    reservationId = reservation.id;
    await signIn(page);
  });

  test.afterEach(async () => {
    await deleteReservationFixture(prisma, BOOKING_CODE);
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('lists eligible candidates and starts an offer', async ({ page }) => {
    await page.goto('/dispatch');
    await page.getByLabel('Reservation').selectOption(reservationId);
    await page.getByRole('button', { name: 'Open', exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/dispatch\\?reservation=${reservationId}`));
    await expect(
      page.getByRole('heading', { name: 'Reservation status: ITINERARY SUBMITTED' }),
    ).toBeVisible();

    // These are client components; retry until hydration attaches the handlers.
    await expect(async () => {
      await page.getByRole('button', { name: 'Show eligible candidates' }).click();
      await expect(page.getByRole('cell', { name: 'Example Guide' })).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 20_000 });

    await expect(async () => {
      await page.getByRole('button', { name: 'Start dispatch' }).click();
      await expect(
        page.getByRole('heading', { name: 'Reservation status: DISPATCH IN PROGRESS' }),
      ).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });

    await expect(page.getByText('GUIDE — OFFERED')).toBeVisible();
  });
});

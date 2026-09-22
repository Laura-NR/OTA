import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

test.describe('storefront package builder', () => {
  test.afterEach(async ({ page }) => {
    const match = page.url().match(/reservations\/([0-9a-f-]+)$/);
    if (match) {
      await prisma.auditLog
        .deleteMany({ where: { entityType: 'Reservation', entityId: match[1] } })
        .catch(() => undefined);
      await prisma.reservation.delete({ where: { id: match[1] } }).catch(() => undefined);
    }
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('builds and submits an itinerary', async ({ page }) => {
    await signIn(page, 'traveler@example.test', {
      origin: STOREFRONT_URL,
      callbackPath: '/build',
    });
    await expect(
      page.getByRole('heading', { name: 'Build your itinerary' }),
    ).toBeVisible();

    await page.getByLabel('Start date').fill('2027-03-01');
    await page.getByLabel('End date').fill('2027-03-05');
    await page.getByRole('button', { name: 'Continue' }).click();

    const stay = page.getByRole('checkbox').first();
    if ((await stay.count()) > 0) {
      await stay.check();
    }
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText(/Estimated total/)).toBeVisible();
    await page.getByRole('button', { name: 'Submit itinerary' }).click();

    await expect(page).toHaveURL(/\/account\/reservations\/[0-9a-f-]+$/);
    await expect(page.getByText('ITINERARY SUBMITTED')).toBeVisible();
  });
});

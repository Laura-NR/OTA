import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

test.describe('storefront curated packages', () => {
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

  test('lists packages and books one into a reservation', async ({ page }) => {
    await signIn(page, 'traveler@example.test', {
      origin: STOREFRONT_URL,
      callbackPath: '/en/packages',
    });

    await expect(page.getByRole('heading', { name: 'Curated packages' })).toBeVisible();
    await page.getByRole('link', { name: /Trinidad Heritage Trail/ }).click();

    await expect(
      page.getByRole('heading', { name: 'Trinidad Heritage Trail' }),
    ).toBeVisible();
    await page.getByLabel('Start date').fill('2027-04-01');
    await page.getByLabel('End date').fill('2027-04-03');
    await page.getByRole('button', { name: 'Book package' }).click();

    await expect(page).toHaveURL(/\/account\/reservations\/[0-9a-f-]+$/);
    await expect(page.getByText('ITINERARY SUBMITTED')).toBeVisible();
  });
});

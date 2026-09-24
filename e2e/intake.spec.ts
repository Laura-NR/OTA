import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

test.describe('operations intake', () => {
  let createdId: string | null = null;

  test.beforeEach(async ({ page }) => {
    createdId = null;
    await signIn(page);
  });

  test.afterEach(async () => {
    if (!createdId) {
      return;
    }
    await prisma.auditLog.deleteMany({
      where: { entityType: 'Reservation', entityId: createdId },
    });
    await prisma.reservation.deleteMany({ where: { id: createdId } });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('creates a booking from the intake form', async ({ page }) => {
    await page.goto('/reservations/new');

    await page.getByLabel('Traveler email').fill('traveler@example.test');
    await page.getByLabel('Total amount').fill('480');
    await page.getByLabel('Start date').fill('2027-06-01');
    await page.getByLabel('End date').fill('2027-06-06');
    await page.getByRole('button', { name: 'Create booking' }).click();

    await expect(page).toHaveURL(/\/reservations\/[0-9a-f-]{36}$/);
    createdId = page.url().split('/').pop() ?? null;

    await expect(page.getByText('reservation.created')).toBeVisible();
    await expect(page.getByText('DRAFT', { exact: true })).toBeVisible();
  });
});

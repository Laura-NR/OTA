import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const BOOKING_CODE = 'E2EREV01';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

async function cleanup(reservationId: string): Promise<void> {
  await prisma.review.deleteMany({ where: { reservationId } }).catch(() => undefined);
  await prisma.auditLog
    .deleteMany({ where: { entityType: 'Reservation', entityId: reservationId } })
    .catch(() => undefined);
  await prisma.reservation
    .delete({ where: { id: reservationId } })
    .catch(() => undefined);
}

test.describe('storefront reviews', () => {
  let reservationId = '';

  test.beforeAll(async () => {
    const traveler = await prisma.user.findUnique({
      where: { email: 'traveler@example.test' },
    });
    if (!traveler) {
      throw new Error('E2E fixtures missing — run the seed first.');
    }

    const existing = await prisma.reservation.findUnique({
      where: { bookingCode: BOOKING_CODE },
    });
    if (existing) {
      await cleanup(existing.id);
    }

    const reservation = await prisma.reservation.create({
      data: {
        userId: traveler.id,
        bookingCode: BOOKING_CODE,
        startDate: new Date('2027-06-01T00:00:00Z'),
        endDate: new Date('2027-06-05T00:00:00Z'),
        status: 'COMPLETED',
        totalCurrency: 'EUR',
        totalAmount: '150.00',
      },
    });
    reservationId = reservation.id;
  });

  test.afterAll(async () => {
    await cleanup(reservationId);
    await prisma.$disconnect();
  });

  test('a traveler submits a CSAT review for a completed trip', async ({ page }) => {
    await signIn(page, 'traveler@example.test', {
      origin: STOREFRONT_URL,
      callbackPath: '/en/account',
    });
    await page.goto(`${STOREFRONT_URL}/en/account/reservations/${reservationId}`);

    await expect(page.getByRole('heading', { name: 'Rate your trip' })).toBeVisible();
    await page.getByLabel('Rating').selectOption('5');
    await page.getByLabel('Comment (optional)').fill('Excellent guides');
    await page.getByRole('button', { name: 'Submit review' }).click();

    await expect(page.getByText('Your rating')).toBeVisible();
    await expect(page.getByText('5 stars')).toBeVisible();
    await expect(page.getByText('Excellent guides')).toBeVisible();
  });
});

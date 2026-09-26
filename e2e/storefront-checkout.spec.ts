import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const BOOKING_CODE = 'E2ECHK01';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

async function cleanup(reservationId: string): Promise<void> {
  await prisma.paymentReceipt
    .deleteMany({ where: { reservationId } })
    .catch(() => undefined);
  await prisma.auditLog
    .deleteMany({ where: { entityType: 'Reservation', entityId: reservationId } })
    .catch(() => undefined);
  await prisma.reservation
    .delete({ where: { id: reservationId } })
    .catch(() => undefined);
}

test.describe('storefront checkout', () => {
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
        startDate: new Date('2027-05-01T00:00:00Z'),
        endDate: new Date('2027-05-04T00:00:00Z'),
        status: 'SECURED_AND_INVOICED',
        totalCurrency: 'EUR',
        totalAmount: '200.00',
      },
    });
    reservationId = reservation.id;
  });

  test.afterAll(async () => {
    await cleanup(reservationId);
    await prisma.$disconnect();
  });

  test('a traveler creates a wire link and sees the bank details without a confirm action', async ({
    page,
  }) => {
    await signIn(page, 'traveler@example.test', {
      origin: STOREFRONT_URL,
      callbackPath: '/en/account',
    });
    await page.goto(`${STOREFRONT_URL}/en/account/reservations/${reservationId}`);

    await page.getByRole('button', { name: 'Proceed to payment' }).click();

    await expect(page).toHaveURL(/\/checkout\/wire\//);
    // The primary rail is a manual wire transfer: bank details, the booking
    // reference, and no self-confirm control (ADR 0003). The amount/reference
    // come from the receipt via the public lookup, not the URL.
    await expect(page.getByText('Bank transfer')).toBeVisible();
    await expect(page.getByText('Demo Bank (placeholder)')).toBeVisible();
    await expect(page.getByText(BOOKING_CODE)).toBeVisible();
    await expect(page.getByText('EUR 200.00')).toBeVisible();
    await expect(page.getByText('No automatic charge is made')).toBeVisible();
    await expect(page.getByText('Once you have sent the transfer')).toBeVisible();
    await expect(page.getByRole('button', { name: /confirm/i })).toHaveCount(0);
  });
});

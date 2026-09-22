import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

// The E2E booking is moved to a payable state directly so the test does not have
// to drive the whole dispatch flow; it is reset afterwards. This uses the
// development database the stack runs against.
process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

test.describe('payment pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await prisma.reservation.update({
      where: { bookingCode: 'E2E0001' },
      data: { status: 'SECURED_AND_INVOICED' },
    });
    await signIn(page);
  });

  test.afterEach(async () => {
    const reservation = await prisma.reservation.findUnique({
      where: { bookingCode: 'E2E0001' },
      select: { id: true },
    });
    if (reservation) {
      await prisma.paymentReceipt.deleteMany({
        where: { reservationId: reservation.id },
      });
      await prisma.document.deleteMany({ where: { reservationId: reservation.id } });
      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { status: 'DRAFT' },
      });
    }
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('creates a payment link and confirms the booking', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /E2E0001/ }).click();
    await expect(page.getByRole('heading', { name: 'E2E0001' })).toBeVisible();

    await page.getByRole('button', { name: 'Create payment link' }).click();
    await expect(page.getByRole('button', { name: 'Mark paid (mock)' })).toBeVisible();

    await page.getByRole('button', { name: 'Mark paid (mock)' }).click();
    await expect(page.getByText('CONFIRMED', { exact: true })).toBeVisible();
  });
});

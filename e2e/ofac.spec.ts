import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const BOOKING_CODE = 'E2EOFC01';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

async function cleanup(): Promise<void> {
  const existing = await prisma.reservation.findUnique({
    where: { bookingCode: BOOKING_CODE },
  });
  if (!existing) return;
  // Affidavits are append-only but deletable (the retention sweep's path).
  await prisma.travelerAffidavit.deleteMany({ where: { reservationId: existing.id } });
  await prisma.paymentReceipt.deleteMany({ where: { reservationId: existing.id } });
  await prisma.auditLog.deleteMany({
    where: { entityType: 'Reservation', entityId: existing.id },
  });
  await prisma.reservation.delete({ where: { id: existing.id } });
}

/**
 * M3 on the desk: a secured booking with a US traveler shows on the dashboard
 * and the "Missing OFAC" view, refuses a payment link, and clears once the desk
 * records the traveler's paper affidavit, whose record opens audited.
 */
test.describe('OFAC certification on the desk', () => {
  let reservationId = '';

  test.beforeAll(async () => {
    await cleanup();
    const traveler = await prisma.user.findUnique({
      where: { email: 'traveler@example.test' },
    });
    if (!traveler) throw new Error('E2E fixtures missing — run the seed first.');
    const reservation = await prisma.reservation.create({
      data: {
        userId: traveler.id,
        bookingCode: BOOKING_CODE,
        startDate: new Date('2027-04-10T00:00:00Z'),
        endDate: new Date('2027-04-17T00:00:00Z'),
        status: 'SECURED_AND_INVOICED',
        totalCurrency: 'EUR',
        totalAmount: '900.00',
        travelers: {
          create: [{ fullName: 'Luis Ortega', nationality: 'US', isLead: true }],
        },
      },
    });
    reservationId = reservation.id;
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('holds payment until the paper affidavit is recorded', async ({ page }) => {
    await signIn(page);
    await expect(page.getByText(/OFAC missing/)).toBeVisible();

    await page.goto('/bookings?view=ofac');
    await expect(page.getByRole('link', { name: BOOKING_CODE }).first()).toBeVisible();

    await page.goto(`/bookings/${reservationId}`);
    const ofac = page.getByRole('region', { name: 'OFAC certification' });
    await expect(ofac.getByText('Not certified', { exact: true })).toBeVisible();
    await expect(ofac.getByText(/not certified yet/)).toBeVisible();

    // The payment link is refused while the traveler has not certified.
    await expect(async () => {
      await page.getByRole('button', { name: 'Create payment link' }).click();
      await expect(page.getByText(/Payment stays locked/)).toBeVisible({
        timeout: 2_000,
      });
    }).toPass();

    await ofac.getByRole('button', { name: 'Record a paper affidavit' }).click();
    await ofac.getByLabel('Signed on').fill('2026-10-16');
    await ofac.getByLabel(/^Scan/).setInputFiles({
      name: 'affidavit.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 signed affidavit'),
    });
    await ofac.getByRole('button', { name: 'Record affidavit' }).click();

    await expect(
      ofac.getByText('Certified · Support for the Cuban people'),
    ).toBeVisible();
    await ofac.getByRole('button', { name: 'View record' }).click();
    await expect(ofac.getByText('admin@example.test')).toBeVisible();
    await expect(ofac.getByText(/logged in the audit trail/)).toBeVisible();

    // The audit log is rendered on the server: reload to see both entries.
    await page.reload();
    await expect(page.getByText('affidavit.recorded')).toBeVisible();
    await expect(page.getByText('affidavit.viewed')).toBeVisible();
  });
});

import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const BOOKING_CODE = 'E2EOFC02';
const US_TRAVELER = 'Jamie Rivera';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

async function cleanup(): Promise<void> {
  const existing = await prisma.reservation.findUnique({
    where: { bookingCode: BOOKING_CODE },
  });
  if (existing) {
    await prisma.travelerAffidavit.deleteMany({ where: { reservationId: existing.id } });
    await prisma.paymentReceipt.deleteMany({ where: { reservationId: existing.id } });
    await prisma.auditLog.deleteMany({
      where: { entityType: 'Reservation', entityId: existing.id },
    });
    await prisma.reservation.delete({ where: { id: existing.id } });
  }
  await prisma.consentRecord.deleteMany({
    where: { user: { email: 'traveler@example.test' }, source: 'ACCOUNT' },
  });
}

/**
 * M3 for the traveler: a US companion certifies their travel category from the
 * trip page (a wrong name is refused) before payment unlocks, and a
 * notification consent set in Preferences is kept.
 */
test.describe('storefront OFAC certification and consents', () => {
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
        startDate: new Date('2027-05-08T00:00:00Z'),
        endDate: new Date('2027-05-15T00:00:00Z'),
        status: 'SECURED_AND_INVOICED',
        totalCurrency: 'EUR',
        totalAmount: '1200.00',
        travelers: {
          create: [
            { fullName: 'Example Traveler', nationality: 'ES', isLead: true },
            { fullName: US_TRAVELER, nationality: 'US', position: 1 },
          ],
        },
      },
    });
    reservationId = reservation.id;
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('a US traveler certifies before payment, and a consent is kept', async ({
    page,
  }) => {
    await signIn(page, 'traveler@example.test', {
      origin: STOREFRONT_URL,
      callbackPath: '/en/account',
    });
    await page.goto(`${STOREFRONT_URL}/en/account/reservations/${reservationId}`);

    const certification = page.getByRole('region', {
      name: 'US travel-category certification',
    });
    await expect(certification.getByText(US_TRAVELER, { exact: true })).toBeVisible();
    // M4: payment shows the locked notice, not the plan choice, until certified.
    await expect(
      page.getByRole('button', { name: 'Continue to bank transfer' }),
    ).toHaveCount(0);

    const signature = certification.getByLabel(
      `Type ${US_TRAVELER}'s full name as a signature`,
    );
    await expect(async () => {
      await signature.fill('Example Traveler');
      await certification.getByRole('button', { name: 'Sign the certification' }).click();
      await expect(
        certification.getByText(/full name as it appears on the booking/),
      ).toBeVisible({
        timeout: 2_000,
      });
    }).toPass();

    await signature.fill('jamie rivera');
    await certification.getByRole('button', { name: 'Sign the certification' }).click();
    await expect(
      certification.getByText('Certified · Support for the Cuban people'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Continue to bank transfer' }),
    ).toBeVisible();

    await page.goto(`${STOREFRONT_URL}/en/account?tab=preferences`);
    const stories = page.getByRole('switch', {
      name: 'Stories and new trips · monthly email',
    });
    await expect(stories).toHaveAttribute('aria-checked', 'false');
    await expect(async () => {
      await stories.click();
      await expect(page.getByText('Saved', { exact: true })).toBeVisible({
        timeout: 2_000,
      });
    }).toPass();
    await page.reload();
    await expect(stories).toHaveAttribute('aria-checked', 'true');

    const stored = await prisma.consentRecord.findFirst({
      where: { user: { email: 'traveler@example.test' }, purpose: 'MARKETING_EMAIL' },
      orderBy: { createdAt: 'desc' },
    });
    expect(stored).toMatchObject({ granted: true, textVersion: 'marketing@2026-10-17' });
  });
});

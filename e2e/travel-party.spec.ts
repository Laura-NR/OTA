import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const BOOKING_CODE = 'E2EPTY01';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

async function cleanup(): Promise<void> {
  const existing = await prisma.reservation.findUnique({
    where: { bookingCode: BOOKING_CODE },
  });
  if (!existing) return;
  await prisma.auditLog.deleteMany({
    where: { entityType: 'Reservation', entityId: existing.id },
  });
  // Travelers, rooms, extras and price lines cascade with the reservation.
  await prisma.reservation.delete({ where: { id: existing.id } });
}

/**
 * The A-Booking travel party (M2): enter the travelers and the rooming list on
 * a package booking, see it priced from the package, the tier and the tenant's
 * child band and fees, then add one of the package's extras.
 */
test.describe('booking travel party', () => {
  let reservationId = '';

  test.beforeAll(async () => {
    await cleanup();
    const traveler = await prisma.user.findUnique({
      where: { email: 'traveler@example.test' },
    });
    const pkg = await prisma.package.findUnique({
      where: { slug: 'trinidad-heritage-trail' },
    });
    if (!traveler || !pkg) {
      throw new Error('E2E fixtures missing — run the seed first.');
    }
    const reservation = await prisma.reservation.create({
      data: {
        userId: traveler.id,
        packageId: pkg.id,
        bookingCode: BOOKING_CODE,
        startDate: new Date('2027-02-13T00:00:00Z'),
        endDate: new Date('2027-02-19T00:00:00Z'),
        status: 'ITINERARY_SUBMITTED',
        totalCurrency: 'EUR',
        totalAmount: '240.00',
      },
    });
    reservationId = reservation.id;
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('enters the party, prices it and adds an extra', async ({ page }) => {
    await signIn(page);
    await page.goto(`/bookings/${reservationId}`);

    const party = page.getByRole('region', { name: 'Travelers' });
    await expect(party.getByText('No travelers entered yet')).toBeVisible();
    const price = page.getByRole('region', { name: 'Price breakdown · EUR' });
    await expect(price.getByText('Not priced yet')).toBeVisible();

    // The edit button is a client component; retry the first pre-hydration click.
    await expect(async () => {
      await party.getByRole('button', { name: 'Edit travelers' }).click();
      await expect(party.getByLabel('Tier')).toBeVisible({ timeout: 1_000 });
    }).toPass();

    await party.getByLabel('Tier').selectOption({ label: 'Comfort' });
    await party.getByLabel('Departure').selectOption({ index: 1 });
    await party.getByRole('button', { name: 'Add room' }).click();
    await party.getByLabel('Room 1').fill('Double');

    await party.getByLabel('Full name, as on the passport').fill('Ana Torres');
    await party.getByRole('button', { name: 'Add traveler' }).click();
    const second = party.getByRole('group', { name: 'Traveler 2' });
    await second.getByLabel('Full name, as on the passport').fill('Luis Torres');
    await second.getByLabel('Type').selectOption('CHILD');
    await second.getByLabel('Date of birth').fill('2018-06-01');
    for (const group of [party.getByRole('group', { name: 'Traveler 1' }), second]) {
      await group.getByLabel('Room', { exact: true }).selectOption({ label: 'Double' });
    }
    await party.getByRole('button', { name: 'Save travelers' }).click();

    await expect(party.getByText('Ana Torres', { exact: true })).toBeVisible();
    await expect(party.getByText('Child · 8', { exact: true })).toBeVisible();
    await expect(party.getByText('Double · sleeps 2', { exact: true })).toBeVisible();

    // 240 departure + 120 Comfort; Luis (8) at 60 % of 360; the tenant's
    // tourist card per traveler and service fee.
    await expect(price.getByText('Child rate', { exact: true })).toBeVisible();
    await expect(price.getByRole('row', { name: /^Total/ })).toContainText('€726.00');

    await party.getByLabel('Extra', { exact: true }).selectOption({ index: 0 });
    await party.getByRole('button', { name: 'Add extra' }).click();
    await expect(
      party.getByText('Horseback ride in the valley', { exact: true }),
    ).toBeVisible();
    await expect(price.getByRole('row', { name: /^Total/ })).toContainText('€796.00');

    await expect(page.getByText('reservation.party_updated')).toBeVisible();
    await expect(page.getByText('reservation.extra_added')).toBeVisible();
  });
});

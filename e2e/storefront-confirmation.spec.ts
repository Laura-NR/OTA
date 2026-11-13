import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const BOOKING_CODE = 'E2ECNF01';
const DAY_MS = 86_400_000;

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

/**
 * The Confirmation screen (Confirmation / M-Confirmation boards): it opens
 * only once the first payment has confirmed the booking, is linked from the
 * trip page, and draws the trip, the next steps, the traveler's documents (not
 * the supplier work orders), the services and the money paid and due. The
 * review appears once the trip is completed.
 */
test.describe('storefront confirmation', () => {
  let reservationId = '';
  let depositId = '';
  let receiptId = '';

  test.beforeAll(async () => {
    await deleteReservationFixture(prisma, BOOKING_CODE);
    const [traveler, pkg] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: 'traveler@example.test' } }),
      prisma.package.findUniqueOrThrow({
        where: { slug: 'trinidad-heritage-trail' },
        include: { tiers: { where: { code: 'standard' } } },
      }),
    ]);
    const start = new Date(Date.UTC(2027, 1, 13));
    const reservation = await prisma.reservation.create({
      data: {
        userId: traveler.id,
        packageId: pkg.id,
        tierId: pkg.tiers[0]!.id,
        bookingCode: BOOKING_CODE,
        startDate: start,
        endDate: new Date(start.getTime() + 7 * DAY_MS),
        status: 'PENDING_PAYMENT',
        totalCurrency: 'EUR',
        totalAmount: '1000.00',
        partySize: 2,
        travelers: {
          create: [
            {
              position: 0,
              isLead: true,
              fullName: 'Example Traveler',
              nationality: 'ES',
            },
            { position: 1, isLead: false, fullName: 'Dana Companion', nationality: 'FR' },
          ],
        },
        serviceItems: {
          create: [
            {
              serviceType: 'ACCOMMODATION',
              status: 'ACCEPTED',
              province: 'Sancti Spíritus',
              serviceDateStart: start,
              serviceDateEnd: new Date(start.getTime() + 3 * DAY_MS),
            },
            {
              serviceType: 'GUIDE',
              status: 'UNASSIGNED',
              province: 'Sancti Spíritus',
              serviceDateStart: new Date(start.getTime() + DAY_MS),
              serviceDateEnd: new Date(start.getTime() + DAY_MS),
            },
          ],
        },
      },
    });
    reservationId = reservation.id;
    const [deposit] = await Promise.all([
      prisma.paymentInstalment.create({
        data: {
          reservationId,
          kind: 'DEPOSIT',
          position: 0,
          amount: '200.00',
          currency: 'EUR',
          dueAt: new Date(Date.now() + DAY_MS),
          status: 'DUE',
        },
      }),
      prisma.paymentInstalment.create({
        data: {
          reservationId,
          kind: 'BALANCE',
          position: 1,
          amount: '800.00',
          currency: 'EUR',
          dueAt: new Date(start.getTime() - 30 * DAY_MS),
          status: 'DUE',
        },
      }),
    ]);
    depositId = deposit.id;
    const receipt = await prisma.paymentReceipt.create({
      data: {
        reservationId,
        instalmentId: depositId,
        rail: 'OPEN_BANKING_SEPA',
        amount: '200.00',
        currency: 'EUR',
        status: 'PENDING',
        gatewayTxId: `wire_e2e_${Date.now()}`,
      },
    });
    receiptId = receipt.id;
  });

  test.afterAll(async () => {
    await deleteReservationFixture(prisma, BOOKING_CODE);
    await prisma.$disconnect();
  });

  test('opens after the deposit confirms the booking', async ({ page }) => {
    const tripUrl = `${STOREFRONT_URL}/en/account/reservations/${reservationId}`;
    await signIn(page, 'traveler@example.test', {
      origin: STOREFRONT_URL,
      callbackPath: '/en/account',
    });

    // Before the first payment there is no confirmation: the trip page has no
    // link and the confirmation address returns to the trip.
    await page.goto(tripUrl);
    await expect(page.getByRole('heading', { name: BOOKING_CODE })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View your confirmation' })).toHaveCount(
      0,
    );
    await page.goto(`${tripUrl}/confirmation`);
    await page.waitForURL(tripUrl);

    // The desk confirms the deposit: the booking is confirmed and documents issue.
    await prisma.$transaction([
      prisma.paymentReceipt.update({
        where: { id: receiptId },
        data: { status: 'PAID', payoutStatus: 'ACCRUED' },
      }),
      prisma.paymentInstalment.update({
        where: { id: depositId },
        data: { status: 'PAID', paidAt: new Date() },
      }),
      prisma.reservation.update({
        where: { id: reservationId },
        data: { status: 'CONFIRMED' },
      }),
      prisma.document.createMany({
        data: ['VOUCHER', 'WORK_ORDER', 'INVOICE'].map((type) => ({
          reservationId,
          type: type as 'VOUCHER' | 'WORK_ORDER' | 'INVOICE',
          storageKey: `${BOOKING_CODE}/${type.toLowerCase()}-e2e.pdf`,
        })),
      }),
    ]);

    await page.goto(tripUrl);
    await expect(page.getByText('Your trip is booked.')).toBeVisible();
    await page.getByRole('link', { name: 'View your confirmation' }).click();
    await page.waitForURL(`${tripUrl}/confirmation`);

    await expect(
      page.getByRole('heading', { level: 1, name: 'Your trip is booked, Example.' }),
    ).toBeVisible();
    await expect(
      page.getByText(/^Trinidad Heritage Trail, .*for you and Dana\./),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download your voucher' })).toBeVisible();
    const calendar = page.getByRole('link', { name: 'Add to calendar' });
    await expect(calendar).toHaveAttribute('download', `${BOOKING_CODE}.ics`);
    const ics = decodeURIComponent((await calendar.getAttribute('href')) ?? '');
    expect(ics).toContain('DTSTART;VALUE=DATE:20270213');
    expect(ics).toContain('DTEND;VALUE=DATE:20270221');

    // Before you fly: the balance, then the entry requirements.
    const steps = page.getByRole('region', { name: 'Before you fly · in order' });
    await expect(steps.getByRole('listitem')).toHaveCount(2);
    await expect(steps.getByText(/^Balance · €800 by Jan 14, 2027$/)).toBeVisible();
    await expect(steps.getByText('Check the entry requirements')).toBeVisible();
    await expect(steps.getByRole('link', { name: 'Pay early' })).toHaveAttribute(
      'href',
      `/en/account/reservations/${reservationId}#pay-title`,
    );

    // The traveler's documents only: the supplier work order stays off the page.
    const documents = page.getByRole('region', { name: 'Your documents' });
    await expect(documents.getByText('Voucher', { exact: true })).toBeVisible();
    await expect(documents.getByText('Invoice', { exact: true })).toBeVisible();
    await expect(documents.getByText('Work order')).toHaveCount(0);

    const services = page.getByRole('region', { name: 'Your services' });
    await expect(services.getByText('Confirmed', { exact: true })).toHaveCount(1);
    await expect(services.getByText('Being arranged', { exact: true })).toHaveCount(1);

    const summary = page.getByRole('complementary', { name: 'Trip summary' });
    await expect(
      summary.getByText('Example Traveler and Dana Companion · Standard'),
    ).toBeVisible();
    await expect(summary.getByText('€1,000', { exact: true })).toBeVisible();
    await expect(summary.getByText(/^Deposit paid .* · bank transfer$/)).toBeVisible();
    await expect(summary.getByText('− €200', { exact: true })).toBeVisible();
    await expect(summary.getByText('Balance due Jan 14, 2027')).toBeVisible();
    await expect(summary.getByText('€800', { exact: true })).toBeVisible();

    // The CSAT review belongs to a completed trip, never to the confirmation.
    await expect(page.getByRole('heading', { name: 'Rate your trip' })).toHaveCount(0);

    await prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Rate your trip' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Before you fly · in order' }),
    ).toHaveCount(0);
  });
});

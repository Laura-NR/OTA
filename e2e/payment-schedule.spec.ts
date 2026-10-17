import { PrismaClient } from '@ota/db';
import { expect, test, type Page } from '@playwright/test';

import { deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

const BOOKING_CODE = 'E2EPAY01';

async function cleanup(): Promise<void> {
  await prisma.document
    .deleteMany({ where: { reservation: { bookingCode: BOOKING_CODE } } })
    .catch(() => undefined);
  await deleteReservationFixture(prisma, BOOKING_CODE);
}

/** Wait until React has hydrated `selector`, so a choice made on it is kept. */
async function hydrated(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((target) => {
    const element = document.querySelector(target);
    return Boolean(
      element && Object.keys(element).some((key) => key.startsWith('__react')),
    );
  }, selector);
}

async function payments(page: Page) {
  const section = page.getByRole('region', { name: /^Payments/ });
  await expect(section).toBeVisible();
  return section;
}

/**
 * M4 on the desk: a deposit plan on a package booking, a window that runs out
 * and shows on the dashboard and the "Payment due" view, a proof of transfer
 * accepted on A-Payments, the deposit confirming the booking, the balance paid
 * after, and a refund approved and recorded as sent by bank transfer.
 */
test.describe('payment schedule (M4)', () => {
  let reservationId = '';

  test.beforeAll(async () => {
    await cleanup();
    const [traveler, pkg] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: 'traveler@example.test' } }),
      prisma.package.findUniqueOrThrow({
        where: { slug: 'trinidad-heritage-trail' },
        include: { departures: { orderBy: { startDate: 'asc' } } },
      }),
    ]);
    const departure = pkg.departures[0]!;
    const reservation = await prisma.reservation.create({
      data: {
        userId: traveler.id,
        packageId: pkg.id,
        departureId: departure.id,
        bookingCode: BOOKING_CODE,
        startDate: departure.startDate,
        endDate: new Date(departure.startDate.getTime() + 2 * 86_400_000),
        status: 'SECURED_AND_INVOICED',
        totalCurrency: 'EUR',
        totalAmount: '1000.00',
      },
    });
    reservationId = reservation.id;
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('takes a deposit, a proof, the balance and a refund', async ({ page }) => {
    await signIn(page);
    await page.goto(`/bookings/${reservationId}`);
    await expect(page.getByRole('heading', { name: BOOKING_CODE })).toBeVisible();

    // The first link fixes the plan: a 20 % deposit, the balance later.
    let section = await payments(page);
    await hydrated(page, '#payment-plan');
    await section.getByLabel('Plan').selectOption('DEPOSIT');
    await section.getByLabel('Rail').selectOption('OPEN_BANKING_SEPA');
    await section.getByRole('button', { name: 'Create payment link' }).click();
    await expect(section.getByText('Deposit · €200.00', { exact: true })).toBeVisible();
    await expect(section.getByText('Balance · €800.00', { exact: true })).toBeVisible();

    // The window runs out: the dashboard and the saved view flag it.
    await prisma.paymentInstalment.updateMany({
      where: { reservationId, kind: 'DEPOSIT' },
      data: { dueAt: new Date(Date.now() - 3_600_000) },
    });
    await page.goto('/dashboard');
    await expect(page.getByText(/payment window over/)).toBeVisible();
    await page.goto('/bookings?view=payment');
    await expect(
      page.getByRole('link', { name: new RegExp(BOOKING_CODE) }),
    ).toBeVisible();

    // The traveler's proof (stored by the storefront spec's route) is accepted
    // on A-Payments, which gives the window another business day.
    const receipt = await prisma.paymentReceipt.findFirstOrThrow({
      where: { reservationId, status: 'PENDING' },
    });
    await prisma.paymentProof.create({
      data: {
        receiptId: receipt.id,
        storageKey: `payment-proofs/${reservationId}/e2e.pdf`,
      },
    });
    await page.goto('/payments');
    const proofs = page.getByRole('region', { name: 'Proofs to check' });
    await expect(proofs.getByText(BOOKING_CODE)).toBeVisible();
    await expect(async () => {
      await proofs.getByRole('button', { name: 'Accept, extend 1 business day' }).click();
      await expect(proofs.getByText('No proof waiting.')).toBeVisible({ timeout: 3_000 });
    }).toPass();
    const deposit = await prisma.paymentInstalment.findFirstOrThrow({
      where: { reservationId, kind: 'DEPOSIT' },
    });
    expect(deposit.dueAt.getTime()).toBeGreaterThan(Date.now());

    // The deposit confirms the booking; the balance is paid after it.
    await page.goto(`/bookings/${reservationId}`);
    section = await payments(page);
    await expect(section.getByText('Proof accepted')).toBeVisible();
    await expect(async () => {
      await section.getByRole('button', { name: 'Mark paid' }).click();
      await expect(page.getByText('CONFIRMED', { exact: true })).toBeVisible({
        timeout: 3_000,
      });
    }).toPass();
    await expect(section.getByText('Next link: Balance · €800.00')).toBeVisible();
    await hydrated(page, '#payment-rail');
    await section.getByLabel('Rail').selectOption('OPEN_BANKING_SEPA');
    await section.getByRole('button', { name: 'Create payment link' }).click();
    await expect(section.getByRole('button', { name: 'Mark paid' })).toBeVisible();
    await section.getByRole('button', { name: 'Mark paid' }).click();
    await expect(section.getByText(/^Paid /)).toHaveCount(2);

    // A goodwill refund within the single limit: one approval, then the bank reference.
    await section.getByLabel('Reason', { exact: true }).selectOption('GOODWILL');
    await section.getByLabel('Amount (EUR)').fill('50');
    await section.getByLabel('Reason, for the record').fill('Late host change.');
    await section.getByRole('button', { name: 'Request refund' }).click();
    await expect(section.getByText('Needs 1 more approval')).toBeVisible();
    await section.getByRole('button', { name: 'Approve' }).click();
    await section.getByRole('button', { name: 'Record as sent' }).click();
    await section.getByLabel('Bank reference').fill(`E2E-${Date.now()}`);
    await section.getByRole('button', { name: 'Record as sent' }).click();
    await expect(section.getByText('Sent', { exact: true })).toBeVisible();

    const refund = await prisma.refund.findFirstOrThrow({ where: { reservationId } });
    expect(refund).toMatchObject({ status: 'SENT', reason: 'GOODWILL' });
  });
});

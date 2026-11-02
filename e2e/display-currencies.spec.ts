import { PrismaClient } from '@ota/db';
import { convertForDisplay } from '@ota/domain';
import { expect, test, type Page } from '@playwright/test';

import { deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const BOOKING_CODE = 'E2EFX001';
const TRAVELER = 'traveler@example.test';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

/** The rate the storefront shows today for `code`, spread included. */
async function rateOf(code: string): Promise<number> {
  const response = await fetch(`${API_URL}/catalog/currencies`);
  const body = (await response.json()) as {
    currencies: { code: string; rate: number }[];
  };
  const found = body.currencies.find((currency) => currency.code === code);
  if (!found) throw new Error(`${code} is not offered today`);
  return found.rate;
}

const whole = (amount: number, currency: string) =>
  new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

async function cleanup(): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { bookingCode: BOOKING_CODE },
  });
  if (reservation) {
    await prisma.paymentReceipt.deleteMany({ where: { reservationId: reservation.id } });
    await prisma.document.deleteMany({ where: { reservationId: reservation.id } });
  }
  await deleteReservationFixture(prisma, BOOKING_CODE);
  await prisma.user.update({
    where: { email: TRAVELER },
    data: { displayCurrency: null },
  });
}

/** Open the header's currency menu and pick `code`, retried until hydrated. */
async function pickInHeader(page: Page, from: string, code: string): Promise<void> {
  await expect(async () => {
    await page.getByRole('button', { name: `Currency: ${from}` }).click();
    await expect(page.getByRole('listbox', { name: 'Currency' })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass();
  await page.getByRole('option', { name: new RegExp(`^${code} ·`) }).click();
  await expect(page.getByRole('button', { name: `Currency: ${code}` })).toBeVisible();
}

/**
 * docs/schema-m9-display-currencies.md end to end: a visitor browses in CAD
 * from the header, a traveler saves GBP on Account, sees "≈" on the trip and
 * the wire page, and the deposit locks the rate on the booking and the desk.
 * The config's `ota_currency=EUR` cookie is where every page starts.
 */
test.describe('display currencies (M9)', () => {
  test.describe.configure({ mode: 'serial' });
  let reservationId = '';

  test.beforeAll(async () => {
    await cleanup();
    const traveler = await prisma.user.findUniqueOrThrow({ where: { email: TRAVELER } });
    const reservation = await prisma.reservation.create({
      data: {
        userId: traveler.id,
        bookingCode: BOOKING_CODE,
        startDate: new Date('2027-05-01T00:00:00Z'),
        endDate: new Date('2027-05-04T00:00:00Z'),
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

  test('a visitor picks CAD in the header and browses packages in it', async ({
    page,
  }) => {
    const pkg = await prisma.package.findUniqueOrThrow({
      where: { slug: 'trinidad-heritage-trail' },
    });
    const card = () => page.getByRole('article').filter({ hasText: pkg.name });
    await page.goto(`${STOREFRONT_URL}/en/packages`);
    await expect(card()).toContainText(whole(Number(pkg.basePrice), 'EUR'));
    await expect(page.getByText('Prices set in EUR')).toHaveCount(0);

    await pickInHeader(page, 'EUR', 'CAD');

    const cad = convertForDisplay(Number(pkg.basePrice), await rateOf('CAD'));
    await expect(card()).toContainText(whole(cad, 'CAD'));
    await expect(page.getByText('Prices set in EUR')).toBeVisible();
    const cookies = await page.context().cookies(STOREFRONT_URL);
    expect(cookies.find((cookie) => cookie.name === 'ota_currency')?.value).toBe('CAD');

    // DS-Handoff: arrow keys open the listbox, Esc closes it and returns focus.
    const button = page.getByRole('button', { name: 'Currency: CAD' });
    await button.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: /^CAD ·/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test('a traveler saves GBP, sees ≈ on the trip, and the deposit locks the rate on the booking and the desk', async ({
    page,
  }) => {
    await signIn(page, TRAVELER, {
      origin: STOREFRONT_URL,
      callbackPath: '/en/account?tab=preferences',
    });
    await expect(page.getByRole('heading', { name: 'Display currency' })).toBeVisible();
    await expect(async () => {
      await page.getByRole('radio', { name: /^GBP ·/ }).check();
      await expect(page.getByRole('radio', { name: /^GBP ·/ })).toBeChecked({
        timeout: 2_000,
      });
    }).toPass();
    await expect
      .poll(
        async () =>
          (await prisma.user.findUniqueOrThrow({ where: { email: TRAVELER } }))
            .displayCurrency,
      )
      .toBe('GBP');

    const gbp = await rateOf('GBP');
    const approx = `≈ ${whole(convertForDisplay(1000, gbp), 'GBP')}`;
    const trip = `${STOREFRONT_URL}/en/account/reservations/${reservationId}`;
    await page.goto(trip);
    await expect(
      page.getByText(`${approx} · the rate locks when you pay the deposit`).first(),
    ).toBeVisible();

    await expect(async () => {
      await page.getByRole('button', { name: 'Continue to bank transfer' }).click();
      await expect(page).toHaveURL(/\/checkout\/wire\//, { timeout: 15_000 });
    }).toPass();
    await expect(page.getByText(approx).first()).toBeVisible();

    // The desk confirms the transfer: the first payment locks the rate.
    await signIn(page, 'admin@example.test', {
      callbackPath: `/bookings/${reservationId}`,
    });
    const section = page.getByRole('region', { name: /^Payments/ });
    await expect(async () => {
      await section.getByRole('button', { name: 'Mark paid' }).click();
      await expect(page.getByText('CONFIRMED', { exact: true })).toBeVisible({
        timeout: 3_000,
      });
    }).toPass();
    const locked = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });
    expect(locked.displayCurrency).toBe('GBP');
    expect(Number(locked.displayRate)).toBe(gbp);
    await expect(
      section.getByText(new RegExp(`^Display rate locked on .*: 1 EUR = ${gbp} GBP\\.`)),
    ).toBeVisible();

    // Back on the trip, the total reads at the locked rate.
    await signIn(page, TRAVELER, {
      origin: STOREFRONT_URL,
      callbackPath: `/en/account/reservations/${reservationId}`,
    });
    await expect(
      page.getByText(new RegExp(`^${approx} · rate locked on `)).first(),
    ).toBeVisible();
  });
});

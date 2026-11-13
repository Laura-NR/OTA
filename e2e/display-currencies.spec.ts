import { PrismaClient } from '@ota/db';
import { convertForDisplay } from '@ota/domain';
import { expect, test, type Page } from '@playwright/test';

import { deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
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

/** The plain text of the one email to the traveler whose subject matches, waited for. */
async function emailText(subject: RegExp): Promise<string> {
  let id = '';
  await expect(async () => {
    const response = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=200`);
    const { messages } = (await response.json()) as {
      messages: { ID: string; Subject: string; To?: { Address: string }[] }[];
    };
    const found = messages.filter(
      (message) =>
        message.To?.some((recipient) => recipient.Address === TRAVELER) &&
        subject.test(message.Subject),
    );
    expect(found).toHaveLength(1);
    id = found[0]!.ID;
  }).toPass({ timeout: 20_000 });
  const detail = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)).json()) as {
    Text?: string;
  };
  return detail.Text ?? '';
}

/** Delete a booking the Booking form made, with the records that refuse a cascade. */
async function deleteBooking(bookingCode: string): Promise<void> {
  const reservation = await prisma.reservation.findUnique({ where: { bookingCode } });
  if (!reservation) return;
  await prisma.consentRecord.deleteMany({ where: { reservationId: reservation.id } });
  await prisma.auditLog.deleteMany({
    where: { entityType: 'Reservation', entityId: reservation.id },
  });
  await prisma.reservation.delete({ where: { id: reservation.id } });
}

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

/**
 * Open the currency menu and pick `code`, retried until hydrated. At the
 * default 1280 px it is the footer's (the header has it only from md to lg).
 */
async function pickInMenu(page: Page, from: string, code: string): Promise<void> {
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
 * from the currency menu, a traveler saves GBP on Account, sees "≈" on the trip and
 * the wire page, and the deposit locks the rate on the booking and the desk; a
 * traveler who books in CAD keeps it, and E-Received and E-Invoice guide their
 * amounts in it (C7b). The config's `ota_currency=EUR` cookie is where every
 * page starts.
 */
test.describe('display currencies (M9)', () => {
  test.describe.configure({ mode: 'serial' });
  let reservationId = '';
  let formBooking = '';

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
    if (formBooking) await deleteBooking(formBooking);
    await cleanup();
    await prisma.$disconnect();
  });

  test('a visitor picks CAD in the currency menu and browses packages in it', async ({
    page,
  }) => {
    const pkg = await prisma.package.findUniqueOrThrow({
      where: { slug: 'trinidad-heritage-trail' },
    });
    const card = () => page.getByRole('article').filter({ hasText: pkg.name });
    await page.goto(`${STOREFRONT_URL}/en/packages`);
    await expect(card()).toContainText(whole(Number(pkg.basePrice), 'EUR'));
    await expect(page.getByText('Prices set in EUR')).toHaveCount(0);

    await pickInMenu(page, 'EUR', 'CAD');

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

  test('the Booking form keeps the currency shown, and E-Received and E-Invoice guide in it (C7b)', async ({
    page,
  }) => {
    const original = await prisma.user.update({
      where: { email: TRAVELER },
      data: { displayCurrency: null },
      select: { nationality: true, phone: true },
    });
    await page
      .context()
      .addCookies([
        { name: 'ota_currency', value: 'CAD', domain: 'localhost', path: '/' },
      ]);
    try {
      await signIn(page, TRAVELER, {
        origin: STOREFRONT_URL,
        callbackPath: '/en/packages/trinidad-heritage-trail/book',
      });

      // Two adults (the default) on the first departure, the default tier, no
      // extras; a lead from Spain, so no US certification.
      await expect(
        page.getByRole('heading', { level: 1, name: "When, and who's coming?" }),
      ).toBeVisible();
      await expect(async () => {
        await page.getByRole('button', { name: 'Continue to stay' }).click();
        await expect(
          page.getByRole('heading', { level: 1, name: 'Where you sleep' }),
        ).toBeVisible({ timeout: 2_000 });
      }).toPass();
      await page.getByRole('button', { name: 'Continue to extras' }).click();
      await page.getByRole('button', { name: 'Continue to traveler details' }).click();
      const lead = page.getByRole('region', {
        name: 'Traveler 1 · lead traveler',
        exact: true,
      });
      await lead.getByLabel('First and middle names').fill('Lucía');
      await lead.getByLabel('Last name').fill('Pérez');
      await lead.getByLabel('Date of birth').fill('1985-03-09');
      await lead.getByLabel('Nationality (passport)').selectOption('ES');
      await lead.getByLabel('Mobile (with country code)').fill('+34 600 000 000');
      await lead.getByLabel('Emergency contact at home').fill('Ana Pérez');
      await lead.getByLabel('Their phone').fill('+34 600 000 001');
      const second = page.getByRole('region', {
        name: 'Traveler 2 · adult',
        exact: true,
      });
      await second.getByLabel('First and middle names').fill('Jorge');
      await second.getByLabel('Last name').fill('Pérez');
      await second.getByLabel('Date of birth').fill('1983-07-21');
      await second.getByLabel('Nationality (passport)').selectOption('ES');
      await page.getByRole('button', { name: 'Review your request' }).click();
      await page.getByRole('checkbox', { name: /read the terms/ }).check();
      await page.getByRole('checkbox', { name: /travel insurance/ }).check();
      await page
        .getByRole('button', { name: 'Send request · nothing charged now' })
        .click();

      await expect(
        page.getByRole('heading', { level: 1, name: 'Request received' }),
      ).toBeVisible();
      const confirmation = await page.getByText(/Booking code:/).textContent();
      formBooking = confirmation?.match(/Booking code:\s*([A-Z0-9]{8})/)?.[1] ?? '';
      expect(formBooking).toMatch(/^[A-Z0-9]{8}$/);

      // The currency the form showed is now the traveler's choice.
      const traveler = await prisma.user.findUniqueOrThrow({
        where: { email: TRAVELER },
      });
      expect(traveler.displayCurrency).toBe('CAD');
      const booking = await prisma.reservation.findUniqueOrThrow({
        where: { bookingCode: formBooking },
      });
      const cad = await rateOf('CAD');
      const total = Number(booking.totalAmount);
      const received = await emailText(
        new RegExp(`^We've got your request · ${formBooking}`),
      );
      expect(received).toContain(
        `(about ${whole(convertForDisplay(total, cad), 'CAD')}; the rate locks when you pay the deposit)`,
      );

      // Every host confirms: E-Invoice guides the amounts payable now.
      await prisma.reservation.update({
        where: { id: booking.id },
        data: { status: 'ASSEMBLY_AND_ESCALATION' },
      });
      await signIn(page, 'admin@example.test', {
        callbackPath: `/bookings/${booking.id}`,
      });
      const transition = await page.request.post(
        `/api/ota/reservations/${booking.id}/transition`,
        { data: { to: 'SECURED_AND_INVOICED' } },
      );
      expect(transition.ok()).toBeTruthy();
      const secured = await emailText(
        new RegExp(`^Your trip is secured · choose how to pay · ${formBooking}$`),
      );
      expect(secured).toContain(
        `the full €${total.toLocaleString('en', { minimumFractionDigits: 2 })} (about ${whole(convertForDisplay(total, cad), 'CAD')})`,
      );
      expect(secured).toMatch(/deposit of €[\d,.]+ \(about CA\$[\d,]+\) now/);
      expect(secured).toContain(
        'Every payment is charged in EUR; the CAD amounts are a guide, and the rate locks when you pay.',
      );
    } finally {
      await prisma.user.update({ where: { email: TRAVELER }, data: original });
    }
  });
});

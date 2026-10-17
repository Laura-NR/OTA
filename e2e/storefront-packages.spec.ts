import { PrismaClient } from '@ota/db';
import { expect, test, type Page } from '@playwright/test';

import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const TRAVELER_EMAIL = 'traveler@example.test';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

/** Delete a booking the spec made, with the records that refuse a cascade. */
async function deleteBooking(bookingCode: string): Promise<void> {
  const reservation = await prisma.reservation.findUnique({ where: { bookingCode } });
  if (!reservation) return;
  // Affidavits refuse UPDATE (M3 trigger) but allow DELETE.
  await prisma.travelerAffidavit.deleteMany({ where: { reservationId: reservation.id } });
  await prisma.consentRecord.deleteMany({ where: { reservationId: reservation.id } });
  await prisma.auditLog.deleteMany({
    where: { entityType: 'Reservation', entityId: reservation.id },
  });
  await prisma.reservation.delete({ where: { id: reservation.id } });
}

function section(page: Page, name: string) {
  return page.getByRole('region', { name, exact: true });
}

/**
 * The storefront Booking form (Booking board, five steps): a signed-in traveler
 * opens a curated package, books two adults and a child on a departure with a
 * tier and an extra, certifies the US lead traveler's travel category, accepts
 * the booking consents and sends the request. The API's frozen price, party,
 * certification and consents are checked in the database.
 */
test.describe('storefront curated packages', () => {
  let bookingCode = '';
  let original: { nationality: string | null; phone: string | null } | null = null;

  test.beforeAll(async () => {
    original = await prisma.user.findUnique({
      where: { email: TRAVELER_EMAIL },
      select: { nationality: true, phone: true },
    });
  });

  test.afterEach(async () => {
    if (bookingCode) {
      await deleteBooking(bookingCode);
      bookingCode = '';
    }
    // Booking stamps the lead's nationality and mobile on the account.
    if (original) {
      await prisma.user.update({ where: { email: TRAVELER_EMAIL }, data: original });
    }
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('lists packages and books one through the five steps', async ({ page }) => {
    await signIn(page, TRAVELER_EMAIL, {
      origin: STOREFRONT_URL,
      callbackPath: '/en/packages',
    });

    await expect(
      page.getByRole('heading', { level: 1, name: 'Trips to Cuba' }),
    ).toBeVisible();
    await page.getByRole('link', { name: /Trinidad Heritage Trail/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Trinidad Heritage Trail' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Check availability & request' }).click();
    await expect(page).toHaveURL(/\/en\/packages\/trinidad-heritage-trail\/book$/);

    // Step 1: the first open departure, two adults (the default) and a child.
    await expect(
      page.getByRole('heading', { level: 1, name: "When, and who's coming?" }),
    ).toBeVisible();
    await expect(page.getByLabel('Departure')).toHaveValue(/[0-9a-f-]{36}/);
    // The counter is a client control: retry the first click until it hydrates.
    await expect(async () => {
      await page.getByRole('button', { name: 'Add one child' }).click();
      await expect(
        page.getByRole('complementary', { name: 'Booking summary' }),
      ).toContainText('2 adults, 1 child', { timeout: 2_000 });
    }).toPass();
    await page.getByRole('button', { name: 'Continue to stay' }).click();

    // Step 2: the Comfort tier.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Where you sleep' }),
    ).toBeVisible();
    await page.getByRole('radio', { name: 'Comfort' }).check();
    await page.getByRole('button', { name: 'Continue to extras' }).click();

    // Step 3: insurance is stated as required; the horseback ride is added.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Insurance and extras' }),
    ).toBeVisible();
    await page.getByRole('checkbox', { name: /Horseback ride in the valley/ }).check();
    await page.getByRole('button', { name: 'Continue to traveler details' }).click();

    // Step 4: three travelers; the US lead certifies their travel category.
    await expect(
      page.getByRole('heading', { level: 1, name: "Who's travelling" }),
    ).toBeVisible();
    const lead = section(page, 'Traveler 1 · lead traveler');
    await lead.getByLabel('First and middle names').fill('Margaret Anne');
    await lead.getByLabel('Last name').fill('Chen');
    await lead.getByLabel('Date of birth').fill('1980-04-02');
    await lead.getByLabel('Nationality (passport)').selectOption('US');
    await lead.getByLabel('Passport number').fill('AB 123 4567');
    await lead.getByLabel('Mobile (with country code)').fill('+1 416 555 0134');
    await lead.getByLabel('Emergency contact at home').fill('Laura Chen');
    await lead.getByLabel('Their phone').fill('+1 604 555 0199');

    const second = section(page, 'Traveler 2 · adult');
    await second.getByLabel('First and middle names').fill('David');
    await second.getByLabel('Last name').fill('Chen');
    await second.getByLabel('Date of birth').fill('1979-11-20');
    await second.getByLabel('Nationality (passport)').selectOption('CA');

    const child = section(page, 'Traveler 3 · child');
    await child.getByLabel('First and middle names').fill('Emma');
    await child.getByLabel('Last name').fill('Chen');
    await child.getByLabel('Date of birth').fill('2018-06-01');
    await child.getByLabel('Nationality (passport)').selectOption('CA');

    // A signature that is not the traveler's name holds the step.
    const signature = lead.getByLabel(
      "Type Margaret Anne Chen's full name as a signature",
    );
    await signature.fill('M. Chen');
    await page.getByRole('button', { name: 'Review your request' }).click();
    await expect(
      lead.getByText('Type Margaret Anne Chen exactly as entered above.'),
    ).toBeVisible();
    await signature.fill('Margaret Anne Chen');
    await page.getByRole('button', { name: 'Review your request' }).click();

    // Step 5: the summary, then both consent boxes before the request can go.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Review and send your request' }),
    ).toBeVisible();
    await expect(page.getByText('US certification signed')).toBeVisible();
    const send = page.getByRole('button', { name: 'Send request · nothing charged now' });
    await expect(send).toBeDisabled();
    await page.getByRole('checkbox', { name: /read the terms/ }).check();
    await page.getByRole('checkbox', { name: /travel insurance/ }).check();
    await send.click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Request received' }),
    ).toBeVisible();
    const confirmation = await page.getByText(/Booking code:/).textContent();
    bookingCode = confirmation?.match(/Booking code:\s*([A-Z0-9]{8})/)?.[1] ?? '';
    expect(bookingCode).toMatch(/^[A-Z0-9]{8}$/);

    const booking = await prisma.reservation.findUniqueOrThrow({
      where: { bookingCode },
      include: {
        tier: true,
        departure: true,
        travelers: { orderBy: { position: 'asc' } },
        extras: true,
        priceLines: true,
        affidavits: true,
        consents: true,
      },
    });
    expect(booking).toMatchObject({ status: 'ITINERARY_SUBMITTED', partySize: 3 });
    expect(booking.tier?.code).toBe('comfort');
    expect(booking.departure?.startDate.toISOString()).toBe('2027-02-13T00:00:00.000Z');
    // The frozen lines add up to the total the form showed and the API accepted.
    const sum = booking.priceLines.reduce(
      (total, line) => total + Number(line.amount),
      0,
    );
    expect(Number(booking.totalAmount)).toBeCloseTo(sum, 2);
    expect(booking.travelers.map((traveler) => traveler.kind)).toEqual([
      'ADULT',
      'ADULT',
      'CHILD',
    ]);
    expect(booking.travelers[0]!.passportNumberEnc).toMatch(/^v1\./);
    expect(booking.travelers[0]!.passportNumberEnc).not.toContain('AB1234567');
    expect(booking.extras).toHaveLength(1);
    expect(booking.affidavits).toEqual([
      expect.objectContaining({ signerName: 'Margaret Anne Chen', source: 'ONLINE' }),
    ]);
    expect(booking.consents.map((consent) => consent.purpose).sort()).toEqual([
      'CANCELLATION_POLICY',
      'INSURANCE_ACKNOWLEDGEMENT',
      'PRIVACY_NOTICE',
      'TERMS',
    ]);

    await page.getByRole('link', { name: 'Go to My trips' }).click();
    await expect(page).toHaveURL(/\/account\/reservations\/[0-9a-f-]+$/);
    // The status badge, as the traveler reads it; the progress bar repeats the label.
    await expect(page.getByText('Request received').first()).toBeVisible();
  });
});

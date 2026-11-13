import { PrismaClient } from '@ota/db';
import { expect, test, type Page } from '@playwright/test';

import { deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

// A 1×1 PNG: enough for the API to store and serve.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('curated package editor', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('opens a package and saves its itinerary', async ({ page }) => {
    await page.goto('/packages');

    const link = page.getByRole('link', { name: 'Trinidad Heritage Trail' });
    await expect(link).toBeVisible();
    await link.click();

    await expect(
      page.getByRole('heading', { name: 'Trinidad Heritage Trail' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Itinerary' })).toBeVisible();
    // M1: the editor carries the tiers, departures, extras and day texts.
    await expect(
      page.getByRole('heading', { name: 'Accommodation tiers' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Departures' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Optional extras' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Day texts' })).toBeVisible();

    // Re-saving the seeded price is a no-op that exercises the replace-all PATCH.
    await page.getByLabel('Base price').fill('240.00');
    await page.getByRole('button', { name: 'Save package' }).click();

    await expect(page.getByText('Package saved.')).toBeVisible();
  });

  test.afterAll(async () => {
    // The translation draft this suite writes; photos are removed in the test.
    await prisma.packageTranslation.deleteMany({
      where: { package: { slug: 'trinidad-heritage-trail' }, locale: 'es' },
    });
    await prisma.$disconnect();
  });

  test('uploads and removes a photo, and saves a translation draft', async ({ page }) => {
    await page.goto('/packages');
    await page.getByRole('link', { name: 'Trinidad Heritage Trail' }).click();
    await expect(
      page.getByRole('heading', { name: 'Trinidad Heritage Trail' }),
    ).toBeVisible();

    // The tabs are a client component; retry the first pre-hydration click.
    await expect(async () => {
      await page.getByRole('tab', { name: 'Photos' }).click();
      await expect(page.getByLabel('Alt text')).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await page
      .getByLabel('Photo', { exact: true })
      .setInputFiles({ name: 'plaza.png', mimeType: 'image/png', buffer: PIXEL });
    await page.getByLabel('Alt text').fill('Plaza Mayor at dusk');
    await page.getByRole('button', { name: 'Upload photo' }).click();
    const photos = page.getByRole('tabpanel', { name: 'Photos' });
    await expect(photos.getByText('Hero', { exact: true })).toBeVisible();
    await expect(photos.getByRole('img', { name: 'Plaza Mayor at dusk' })).toBeVisible();
    await photos.getByRole('button', { name: 'Remove' }).click();
    await expect(photos.getByText('No photos yet.')).toBeVisible();

    await page.getByRole('tab', { name: 'Translations' }).click();
    const translations = page.getByRole('tabpanel', { name: 'Translations' });
    await translations.getByLabel('Language', { exact: true }).selectOption('es');
    await translations
      .getByLabel('Name', { exact: true })
      .fill('Ruta del patrimonio de Trinidad');
    await translations.getByRole('button', { name: 'Save translation' }).click();
    await expect(translations.getByText('Translation saved.')).toBeVisible();
    await expect(translations.getByText('ES · draft')).toBeVisible();
  });

  /**
   * A booking points at its package's departure, tier and extra. Saving the
   * editor keeps those rows, and everything it does not show on them; a save
   * that would take a row from under the booking is refused and names it. The
   * package stays a draft: a published one enters the storefront's cached list,
   * which outlives this test and breaks the specs that count the trips.
   */
  test.describe('a package with a booking', () => {
    const bookingCode = 'E2EPKG01';
    let packageId = '';
    const row = (page: Page, input: string) =>
      page.locator('div.grid', { has: page.locator(input) }).last();

    test.beforeEach(async () => {
      const item = await prisma.inventoryItem.findFirstOrThrow({
        where: { active: true },
      });
      const traveler = await prisma.user.findUniqueOrThrow({
        where: { email: 'traveler@example.test' },
      });
      const pkg = await prisma.package.create({
        data: {
          name: 'E2E Booked Package',
          slug: 'e2e-booked-package',
          durationDays: 3,
          basePrice: '500.00',
          services: { create: { inventoryItemId: item.id } },
          days: { create: { dayOffset: 0, title: 'Arrival', meals: 'Dinner' } },
          tiers: {
            create: {
              code: 'standard',
              name: 'Standard',
              description: 'Casas in the old town',
              isDefault: true,
            },
          },
          departures: {
            create: [
              { startDate: new Date('2027-05-01T00:00:00Z'), capacity: 8 },
              {
                startDate: new Date('2027-06-05T00:00:00Z'),
                capacity: 8,
                status: 'CLOSED',
              },
              { startDate: new Date('2027-07-03T00:00:00Z'), capacity: 8 },
            ],
          },
          extras: {
            create: {
              code: 'horseback',
              name: 'Horseback ride',
              durationLabel: 'Half day',
              inventoryItemId: item.id,
              dayOffset: 1,
              price: '35.00',
              active: false,
            },
          },
        },
        include: {
          departures: { orderBy: { startDate: 'asc' } },
          tiers: true,
          extras: true,
        },
      });
      packageId = pkg.id;
      await prisma.reservation.create({
        data: {
          userId: traveler.id,
          bookingCode,
          packageId: pkg.id,
          status: 'ITINERARY_SUBMITTED',
          startDate: new Date('2027-05-01T00:00:00Z'),
          endDate: new Date('2027-05-03T00:00:00Z'),
          totalCurrency: 'EUR',
          totalAmount: '1500.00',
          partySize: 3,
          departureId: pkg.departures[0]!.id,
          tierId: pkg.tiers[0]!.id,
          extras: {
            create: {
              packageExtraId: pkg.extras[0]!.id,
              label: 'Horseback ride',
              unitAmount: '35.00',
              amount: '105.00',
            },
          },
        },
      });
    });

    test.afterEach(async () => {
      await deleteReservationFixture(prisma, bookingCode);
      await prisma.auditLog.deleteMany({ where: { entityId: packageId } });
      await prisma.package.deleteMany({ where: { id: packageId } });
    });

    const stored = () =>
      prisma.package.findUniqueOrThrow({
        where: { id: packageId },
        include: {
          days: true,
          tiers: true,
          extras: true,
          departures: { orderBy: { startDate: 'asc' } },
          reservations: { include: { extras: true } },
        },
      });

    test('keeps the booking on a save, and refuses one that would take its rows', async ({
      page,
    }) => {
      const before = await stored();
      const links = (pkg: typeof before) => ({
        departureIds: pkg.departures.map((departure) => departure.id),
        tierId: pkg.reservations[0]?.tierId,
        departureId: pkg.reservations[0]?.departureId,
        extraId: pkg.reservations[0]?.extras[0]?.packageExtraId,
      });

      await page.goto(`/packages/${packageId}`);
      const save = page.getByRole('button', { name: 'Save package' });

      // A save that changes nothing changes nothing, hidden fields included.
      await expect(async () => {
        await save.click();
        await expect(page.getByText('Package saved.')).toBeVisible({ timeout: 2000 });
      }).toPass();
      const afterSave = await stored();
      expect(links(afterSave)).toEqual(links(before));
      expect(afterSave.reservations[0]?.departureId).not.toBeNull();
      expect(afterSave.departures.map((departure) => departure.status)).toEqual([
        'OPEN',
        'CLOSED',
        'OPEN',
      ]);
      expect(afterSave.tiers[0]?.description).toBe('Casas in the old town');
      expect(afterSave.days[0]?.meals).toBe('Dinner');
      expect(afterSave.extras[0]).toMatchObject({
        durationLabel: 'Half day',
        inventoryItemId: before.extras[0]!.inventoryItemId,
        dayOffset: 1,
        active: false,
      });

      // The booked departure cannot go: the desk says which booking holds it.
      await row(page, '#package-departure-date-0')
        .getByRole('button', { name: 'Remove' })
        .click();
      await save.click();
      await expect(page.getByText('The package was not saved.')).toBeVisible();
      await expect(
        page.getByText(`The departure on 2027-05-01 has bookings: ${bookingCode}.`),
      ).toBeVisible();
      expect(links(await stored())).toEqual(links(before));

      // Nor can its seats go below the three travelers booked on it.
      await page.reload();
      await page.locator('#package-departure-seats-0').fill('2');
      await save.click();
      await expect(page.getByText(`has 3 seats booked (${bookingCode})`)).toBeVisible();

      // Closing it is the way to stop new bookings; the booking stays on it.
      await page.reload();
      await page.locator('#package-departure-status-0').selectOption('CLOSED');
      await save.click();
      await expect(page.getByText('Package saved.')).toBeVisible();
      const closed = await stored();
      expect(links(closed)).toEqual(links(before));
      expect(closed.departures[0]?.status).toBe('CLOSED');
    });
  });
});

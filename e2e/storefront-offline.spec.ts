import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

/**
 * The offline kit and the offline page (Account board "Documents & offline
 * kit"; DS 05 offline mode): a trip saved on the device opens with no network,
 * documents included; any other page falls back to the offline page with the
 * saved trips and the emergency numbers; signing out removes the kit. Uses
 * the seeded DEMO0001 of traveler@example.test and leaves nothing behind.
 */
const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('storefront offline kit', () => {
  test('a saved trip opens offline and signing out removes it', async ({
    page,
    context,
  }) => {
    test.setTimeout(150_000);
    const reservation = await prisma.reservation.findFirstOrThrow({
      where: { bookingCode: 'DEMO0001' },
      select: { id: true, documents: { select: { id: true }, take: 1 } },
    });
    const tripPath = `/en/account/reservations/${reservation.id}`;

    await signIn(page, 'traveler@example.test', {
      origin: STOREFRONT_URL,
      callbackPath: '/en/account',
    });
    await page.goto(`${STOREFRONT_URL}${tripPath}`);
    // The worker installs (keeping each locale's offline page), then controls
    // the pages loaded after it.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);

    const kit = page.locator('#offline-kit');
    await kit.getByRole('button', { name: 'Save on this device' }).click();
    await expect(kit.getByText(/^Saved on this device · .+ · \d/)).toBeVisible({
      timeout: 60_000,
    });
    await expect(kit.getByRole('button', { name: 'Update kit' })).toBeVisible();

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByRole('heading', { name: 'DEMO0001' })).toBeVisible();
      await expect(
        page.getByRole('status').filter({ hasText: 'showing your saved trip, updated' }),
      ).toBeVisible();
      const document = reservation.documents[0];
      if (document) {
        const download = await page.evaluate(
          (path) => fetch(path).then((response) => response.status),
          `/api/ota/documents/${document.id}/download`,
        );
        expect(download).toBe(200);
      }

      // A page the device never saved: the offline page, with the saved trip.
      await page.goto(`${STOREFRONT_URL}/en/packages`);
      await expect(
        page.getByRole('heading', { level: 1, name: "You're offline" }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Emergency · works offline' }),
      ).toBeVisible();
      await page.getByRole('link', { name: 'Open DEMO0001' }).click();
      await expect(page.getByRole('heading', { name: 'DEMO0001' })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }

    await page.goto(`${STOREFRONT_URL}${tripPath}`);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
    expect(await page.evaluate(() => caches.has('ota-kit-v1'))).toBe(false);
  });
});

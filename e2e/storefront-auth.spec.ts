import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';

test.describe('storefront traveler account', () => {
  test('signs a traveler in and shows their bookings and vouchers', async ({ page }) => {
    await signIn(page, 'traveler@example.test', {
      origin: STOREFRONT_URL,
      callbackPath: '/en/account',
    });

    await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'E2E0001' })).toBeVisible();

    await page.getByRole('link', { name: 'E2E0001' }).click();
    await expect(page).toHaveURL(/\/account\/reservations\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: 'E2E0001' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Itinerary' })).toBeVisible();
  });
});

import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';

test.describe('storefront traveler account', () => {
  test('signs a traveler in and shows their bookings and vouchers', async ({ page }) => {
    await signIn(page, 'traveler@example.test', {
      origin: STOREFRONT_URL,
      callbackPath: '/en/account',
    });

    // The account opens on its overview; trips are a section of it.
    await expect(page.getByRole('heading', { level: 1, name: /^Hola/ })).toBeVisible();
    await page.getByRole('link', { name: /^My trips/ }).click();
    await expect(page).toHaveURL(/\/en\/account\?tab=trips$/);
    await expect(page.getByRole('heading', { level: 1, name: 'My trips' })).toBeVisible();

    await page.getByRole('link', { name: 'E2E0001' }).click();
    await expect(page).toHaveURL(/\/account\/reservations\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: 'E2E0001' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Itinerary' })).toBeVisible();
  });

  test('sends a message to operations from the booking page', async ({ page }) => {
    await signIn(page, 'traveler@example.test', {
      origin: STOREFRONT_URL,
      callbackPath: '/en/account?tab=trips',
    });
    await page.getByRole('link', { name: 'E2E0001' }).click();
    await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();

    const body = `e2e message ${Date.now()}`;
    await page.getByLabel('Messages').fill(body);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(body)).toBeVisible();
  });
});

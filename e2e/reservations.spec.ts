import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test.describe('reservations pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('opens a booking from the board and applies a legal transition', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { name: 'Reservations' })).toBeVisible();

    const card = page.getByRole('link', { name: /E2E0001/ });
    await expect(card).toBeVisible();
    await card.click();

    await expect(page).toHaveURL(/\/reservations\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: 'E2E0001' })).toBeVisible();
    await expect(page.getByText('DRAFT', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'ITINERARY SUBMITTED' }).click();

    await expect(
      page.getByRole('button', { name: 'DISPATCH IN PROGRESS' }),
    ).toBeVisible();
    await expect(page.getByText('reservation.transition').first()).toBeVisible();
  });

  test('signs out back to the login page', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

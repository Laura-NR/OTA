import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test.describe('reservations pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('lists the pipeline and applies a legal transition in the browser', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { name: 'Reservations' })).toBeVisible();

    const row = page.locator('tr', { hasText: 'E2E0001' });
    await expect(row.getByText('DRAFT', { exact: true })).toBeVisible();

    await row.getByRole('button', { name: 'ITINERARY SUBMITTED' }).click();

    await expect(row.getByRole('button', { name: 'DISPATCH IN PROGRESS' })).toBeVisible();
    await expect(row.getByText('DRAFT', { exact: true })).toHaveCount(0);
  });

  test('signs out back to the login page', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

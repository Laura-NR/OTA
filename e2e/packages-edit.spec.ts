import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

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

    // Re-saving the seeded price is a no-op that exercises the replace-all PATCH.
    await page.getByLabel('Base price').fill('240.00');
    await page.getByRole('button', { name: 'Save package' }).click();

    await expect(page.getByText('Package saved.')).toBeVisible();
  });
});

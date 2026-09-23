import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test.describe('curated packages back-office', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('lists the seeded package and offers the create form', async ({ page }) => {
    await page.goto('/packages');

    await expect(page.getByRole('heading', { name: 'Curated packages' })).toBeVisible();
    await expect(
      page.getByRole('cell', { name: /Trinidad Heritage Trail/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'New curated package' }),
    ).toBeVisible();
  });
});

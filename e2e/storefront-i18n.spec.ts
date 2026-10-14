import { expect, test } from '@playwright/test';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';

// The unprefixed path resolves via middleware locale detection; pin the browser
// to Spanish so the default-locale assertions are deterministic.
test.use({ locale: 'es' });

test.describe('storefront locales', () => {
  // The destination copy is tenant content, English until translated; the map
  // controls are core strings in every locale.
  test('switches the destinations page between es, en, and fr', async ({ page }) => {
    await page.goto(`${STOREFRONT_URL}/destinations`);
    await expect(page.getByRole('button', { name: 'Dónde operamos' })).toBeVisible();

    await page.getByRole('link', { name: 'en', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/destinations$/);
    await expect(page.getByRole('button', { name: 'Where we operate' })).toBeVisible();

    await page.getByRole('link', { name: 'fr', exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/destinations$/);
    await expect(page.getByRole('button', { name: 'Où nous opérons' })).toBeVisible();
  });
});

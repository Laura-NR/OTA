import { expect, test } from '@playwright/test';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';

// The unprefixed path resolves via middleware locale detection; pin the browser
// to Spanish so the default-locale assertions are deterministic.
test.use({ locale: 'es' });

test.describe('storefront locales', () => {
  test('switches the catalog between es, en, and fr', async ({ page }) => {
    await page.goto(`${STOREFRONT_URL}/catalog`);
    await expect(page.getByRole('heading', { name: 'Experiencias' })).toBeVisible();

    await page.getByRole('link', { name: 'en', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/catalog$/);
    await expect(page.getByRole('heading', { name: 'Experiences' })).toBeVisible();

    await page.getByRole('link', { name: 'fr', exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/catalog$/);
    await expect(page.getByRole('heading', { name: 'Expériences' })).toBeVisible();
  });
});

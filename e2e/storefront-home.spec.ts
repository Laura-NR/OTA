import { expect, test } from '@playwright/test';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';

test.describe('storefront home', () => {
  test('shows the agency copy and the live trips, and searches the packages', async ({
    page,
  }) => {
    await page.goto(`${STOREFRONT_URL}/en`);

    await expect(
      page.getByRole('heading', { level: 1, name: 'Travel Cuba with respect.' }),
    ).toBeVisible();
    // The tenant's Home copy is still a placeholder, and says so.
    await expect(page.getByText('Sample content', { exact: true })).toBeVisible();
    // Home carries both strips: conditions and the event.
    await expect(page.getByText('Cuba right now · advisory Level 2.')).toBeVisible();
    await expect(page.getByText('Havana Jazz Festival · 18–24 Jan 2027.')).toBeVisible();
    // Featured trips are the live package catalogue.
    await expect(
      page.getByRole('heading', { name: 'Trinidad Heritage Trail' }),
    ).toBeVisible();

    await page.getByLabel('Where do you want to go?').fill('trinidad');
    await page.getByRole('button', { name: 'Find your Cuba trip' }).click();
    await expect(page).toHaveURL(/\/en\/packages\?q=trinidad$/);
    await expect(
      page.getByRole('link', { name: /Trinidad Heritage Trail/ }),
    ).toBeVisible();
    // The event strip belongs to Home; the conditions strip follows the trip pages.
    await expect(page.getByText('Havana Jazz Festival · 18–24 Jan 2027.')).toHaveCount(0);
    await expect(page.getByText('Cuba right now · advisory Level 2.')).toBeVisible();
  });
});

import { expect, test } from '@playwright/test';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';

test.describe('storefront catalog map', () => {
  test('renders every province and filters the catalog on select', async ({ page }) => {
    await page.goto(`${STOREFRONT_URL}/en/catalog`);
    await expect(page.getByRole('heading', { name: 'Experiences' })).toBeVisible();

    const map = page.getByRole('group', { name: 'Map of Cuba by province' });
    await expect(map).toBeVisible();
    await expect(map.getByRole('button')).toHaveCount(16);

    await map.getByRole('button', { name: 'La Habana', exact: true }).click();
    await expect(page).toHaveURL(/province=La[+%20]Habana/);
    await expect(page.getByRole('heading', { name: 'Experiences' })).toBeVisible();

    // Selecting the same province again clears the filter.
    await map.getByRole('button', { name: 'La Habana', exact: true }).click();
    await expect(page).not.toHaveURL(/province=/);
  });
});

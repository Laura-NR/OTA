import { expect, test } from '@playwright/test';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';

test.describe('storefront packages filters and compare', () => {
  test('filters the live catalogue and keeps the filters in the URL', async ({
    page,
  }) => {
    await page.goto(`${STOREFRONT_URL}/en/packages?q=atlantis`);
    await expect(page.getByText('No trip matches these filters.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Remove filter “atlantis”' }),
    ).toBeVisible();

    await expect(async () => {
      await page.getByRole('button', { name: 'Clear all' }).first().click();
      await expect(page.getByText('Showing 1 of 1 trip')).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await expect(page).toHaveURL(/\/en\/packages$/);

    await page.getByRole('button', { name: '6–8 days', exact: true }).click();
    await expect(page.getByText('Showing 0 of 1 trip')).toBeVisible();
    await expect(page).toHaveURL(/duration=week/);
    await page.getByRole('button', { name: '6–8 days', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Sancti Spíritus' }).check();
    await expect(page.getByText('Showing 1 of 1 trip')).toBeVisible();
    await expect(page).toHaveURL(/province=Sancti/);
  });

  test('keeps the compare selection while browsing and compares it', async ({ page }) => {
    await page.goto(`${STOREFRONT_URL}/en/packages`);
    const tray = page.getByRole('region', { name: 'Compare selection' });
    await expect(async () => {
      await page
        .getByRole('checkbox', { name: 'Compare Trinidad Heritage Trail' })
        .check();
      await expect(tray).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await expect(tray.getByText('1 trip selected to compare')).toBeVisible();
    await expect(tray.getByText('Pick at least 2')).toBeVisible();

    // An empty Compare picks up the selection made while browsing.
    await page.goto(`${STOREFRONT_URL}/en/packages/compare`);
    await expect(page).toHaveURL(/trips=trinidad-heritage-trail/);
    await expect(page.getByRole('row', { name: /Where you sleep/ })).toContainText(
      'Casa Colonial Trinidad',
    );

    await page
      .getByRole('button', { name: 'Remove Trinidad Heritage Trail from comparison' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Nothing to compare yet' }),
    ).toBeVisible();
  });
});

import { expect, test } from '@playwright/test';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';

test.describe('storefront sign-in page', () => {
  test('emails a sign-in link from the form', async ({ page }) => {
    await page.goto(`${STOREFRONT_URL}/en/login`);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();

    await expect(async () => {
      await page.getByLabel('Email', { exact: true }).fill('traveler@example.test');
      await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
      await expect(
        page.getByText(/a sign-in link is on its way to traveler@example\.test/),
      ).toBeVisible({
        timeout: 2_000,
      });
    }).toPass();
  });
});

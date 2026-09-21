import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test.describe('supplier compliance', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto('/suppliers');
    await expect(page.getByRole('heading', { name: 'Suppliers' })).toBeVisible();
  });

  test('suspends and reinstates a verified supplier in the browser', async ({ page }) => {
    const row = page.locator('tr', { hasText: 'guide@example.test' });
    await expect(row.getByText('VERIFIED', { exact: true })).toBeVisible();

    await row.getByRole('button', { name: 'Suspend' }).click();
    await expect(
      page.locator('tr', { hasText: 'guide@example.test' }).getByText('SUSPENDED', {
        exact: true,
      }),
    ).toBeVisible();

    await page
      .locator('tr', { hasText: 'guide@example.test' })
      .getByRole('button', { name: 'Reinstate' })
      .click();
    await expect(
      page.locator('tr', { hasText: 'guide@example.test' }).getByText('VERIFIED', {
        exact: true,
      }),
    ).toBeVisible();
  });
});

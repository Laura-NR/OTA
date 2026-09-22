import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

// A valid 1x1 PNG so the inspector's <img> renders with intrinsic size.
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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

  test('uploads a credential and shows it in the inspector', async ({ page }) => {
    await page.getByRole('link', { name: 'Example Guide' }).click();
    await expect(page.getByRole('heading', { name: 'Example Guide' })).toBeVisible();

    await page.getByLabel(/Upload credential/).setInputFiles({
      name: 'formatur.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_1X1, 'base64'),
    });
    await page.getByRole('button', { name: 'Upload', exact: true }).click();

    await expect(page.getByAltText('Supplier credential')).toBeVisible();
  });
});

import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

// A valid 1x1 PNG so the gallery's <img> renders with intrinsic size.
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test.describe('inventory CMS', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto('/inventory');
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  });

  test('creates, prices, illustrates, and deletes a catalog item', async ({ page }) => {
    await page.getByLabel('Name').fill('E2E Casa');
    await page.getByLabel('Province').fill('La Habana');
    await page.getByLabel('Base price').fill('90');
    await page.getByRole('button', { name: 'Add item' }).click();

    await page.getByRole('link', { name: 'E2E Casa' }).click();
    await expect(page.getByRole('heading', { name: 'E2E Casa' })).toBeVisible();

    await page.getByLabel(/Upload image/).setInputFiles({
      name: 'casa.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_1X1, 'base64'),
    });
    await page.getByRole('button', { name: 'Upload image', exact: true }).click();
    await expect(page.getByAltText('Catalog image')).toBeVisible();

    await page.getByLabel('Kind').selectOption('MARKUP');
    await page.getByLabel('Label').fill('E2E markup');
    await page.getByLabel('Markup percent').fill('12');
    await page.getByRole('button', { name: 'Add rule' }).click();
    await expect(page.getByText('E2E markup')).toBeVisible();
    await expect(page.getByText('12%')).toBeVisible();

    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: '← Inventory' }).click();
    await page
      .locator('tr', { hasText: 'E2E Casa' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.getByRole('link', { name: 'E2E Casa' })).toHaveCount(0);
  });
});

import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test.describe('GDPR retention lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('shows the retention pipeline for operations', async ({ page }) => {
    await page.goto('/retention');

    await expect(page.getByRole('heading', { name: 'Data retention' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Retention pipeline' })).toBeVisible();
    await expect(page.getByText('30-day grace')).toBeVisible();
  });
});

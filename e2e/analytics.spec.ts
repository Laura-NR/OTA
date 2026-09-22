import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test.describe('analytics dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('renders the KPI overview for an operator', async ({ page }) => {
    await page.goto('/analytics');

    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await expect(page.getByText('Gross booking value')).toBeVisible();
    await expect(page.getByText('Net revenue')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Booking funnel' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Service geography' })).toBeVisible();
  });
});

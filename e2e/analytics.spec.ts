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
    await expect(
      page.getByRole('heading', { name: 'Revenue by package type' }),
    ).toBeVisible();
  });

  test('downloads the BI workbook', async ({ page }) => {
    await page.goto('/analytics');

    const link = page.getByRole('link', { name: 'Download XLSX digest' });
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    expect(href).toBeTruthy();

    const response = await page.request.get(href ?? '');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('spreadsheetml');
  });
});

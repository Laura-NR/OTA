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

  test('downloads the BI digests', async ({ page }) => {
    await page.goto('/analytics');

    const xlsx = page.getByRole('link', { name: 'Download XLSX digest' });
    await expect(xlsx).toBeVisible();
    const xlsxResponse = await page.request.get((await xlsx.getAttribute('href')) ?? '');
    expect(xlsxResponse.status()).toBe(200);
    expect(xlsxResponse.headers()['content-type']).toContain('spreadsheetml');

    const pdf = page.getByRole('link', { name: 'Download PDF digest' });
    await expect(pdf).toBeVisible();
    const pdfResponse = await page.request.get((await pdf.getAttribute('href')) ?? '');
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()['content-type']).toContain('application/pdf');
  });
});

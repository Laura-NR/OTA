import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test.describe('reports', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('renders the merged KPI report for an operator', async ({ page }) => {
    await page.goto('/reports');

    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await expect(page.getByText('Gross booking value', { exact: true })).toBeVisible();
    await expect(page.getByText('Net revenue', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Booking conversion funnel' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Service geography' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Take rate by package type' }),
    ).toBeVisible();
  });

  test('downloads the BI digests', async ({ page }) => {
    await page.goto('/reports');

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

  test('the section nav anchors reach each section', async ({ page }) => {
    await page.goto('/reports');

    await page.getByRole('link', { name: 'Regulatory · MINTUR & ONAT' }).click();
    await expect(page).toHaveURL(/#regulatory$/);
    await expect(
      page.getByRole('heading', { name: 'Regulatory & tax compliance' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Experience & duty of care' }).click();
    await expect(page).toHaveURL(/#quality$/);
    await expect(
      page.getByRole('heading', { name: 'Service quality, experience & duty of care' }),
    ).toBeVisible();
  });
});

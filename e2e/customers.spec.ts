import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test.describe('customer accounts', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('lists accounts and opens a customer profile with trips and retention', async ({
    page,
  }) => {
    await page.goto('/customers');
    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();

    const response = await page.request.get('/api/ota/customers');
    const customers = (await response.json()) as { id: string; email: string }[];
    const target = customers.find((row) => row.email === 'traveler@example.test');
    expect(target).toBeTruthy();

    await page.goto(`/customers/${target?.id}`);
    await expect(page.getByRole('heading', { name: 'Trips' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'GDPR retention' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'DEMO0001' })).toBeVisible();
  });
});

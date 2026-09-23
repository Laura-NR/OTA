import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test.describe('quality & duty of care', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('logs, surfaces, and resolves an incident from the workbench', async ({
    page,
  }) => {
    const response = await page.request.get('/api/ota/reservations');
    const reservations = (await response.json()) as { id: string; bookingCode: string }[];
    const target = reservations.find((row) => row.bookingCode === 'E2E0001');
    expect(target).toBeTruthy();

    await page.goto(`/reservations/${target?.id}`);
    await expect(page.getByRole('heading', { name: 'Duty of care' })).toBeVisible();

    const description = `e2e incident ${Date.now()}`;
    await page.getByLabel('Category').fill('MEDICAL');
    await page.getByLabel('Severity').selectOption('HIGH');
    await page.getByLabel('Description').fill(description);
    await page.getByRole('button', { name: 'Log incident' }).click();

    await expect(page.getByText(description)).toBeVisible();

    await page.getByRole('button', { name: 'Resolve' }).first().click();
    await expect(page.getByText('Resolved').first()).toBeVisible();

    await page.goto('/quality');
    await expect(
      page.getByRole('heading', { name: 'Quality & duty of care' }),
    ).toBeVisible();
    await expect(page.getByText(description)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Worker reliability' })).toBeVisible();
  });
});

import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test.describe('regulatory reporting', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('renders the MINTUR summary and the fiscal export', async ({ page }) => {
    await page.goto('/regulatory');

    await expect(
      page.getByRole('heading', { name: 'Regulatory reporting' }),
    ).toBeVisible();
    await expect(page.getByText('Specialised ratio')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Tourism classification' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nationalities' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Geographic circuits' }),
    ).toBeVisible();
    await expect(page.getByRole('cell', { name: 'ECOTOURISM' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Download fiscal ledger (CSV)' }),
    ).toBeVisible();
  });

  test('classifies a booking from the operator workbench', async ({ page }) => {
    const card = page.getByRole('link', { name: /E2E0001/ });
    await expect(card).toBeVisible();
    await card.click();

    await page.getByLabel('Tourism classification').selectOption('ECOTOURISM');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByText('reservation.classified').first()).toBeVisible();
  });
});

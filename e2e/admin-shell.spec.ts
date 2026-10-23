import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test.describe('admin shell (A-Dashboard)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('lands on the dashboard and links only the sections that exist', async ({
    page,
  }) => {
    const sidebar = page.getByRole('navigation', { name: 'Admin' });

    await expect(sidebar.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const section of [
      'Bookings',
      'Disruptions',
      'Packages',
      'Customers',
      'Suppliers',
      'Payments',
      'Content',
      'Reports',
      'Settings',
    ]) {
      await expect(sidebar.getByRole('link', { name: section })).toBeVisible();
    }
    await expect(page.getByText('Super Admin', { exact: true })).toBeVisible();
  });

  test('shows a section’s pages as tabs and keeps the section current', async ({
    page,
  }) => {
    await page
      .getByRole('navigation', { name: 'Admin' })
      .getByRole('link', { name: 'Bookings' })
      .click();
    await expect(page).toHaveURL(/\/bookings$/);

    const tabs = page.getByRole('navigation', { name: 'Bookings' });
    await expect(tabs.getByRole('link', { name: 'Pipeline' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await tabs.getByRole('link', { name: 'Messages' }).click();
    await expect(page).toHaveURL(/\/bookings\/messages$/);
    await expect(tabs.getByRole('link', { name: 'Messages' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('redirects the pre-redesign paths to their new homes', async ({ page }) => {
    const moved: Array<[string, string]> = [
      ['/escalation', '/dashboard'],
      ['/dashboard/dispatch', '/dashboard'],
      ['/reservations/new', '/bookings/new'],
      ['/inventory', '/packages/inventory'],
      ['/applications', '/suppliers/applications'],
      ['/analytics', '/reports'],
      ['/retention', '/customers/retention'],
    ];
    for (const [from, to] of moved) {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`${to}$`));
    }
  });

  test('shows the payment ledger and the settings tabs', async ({ page }) => {
    const sidebar = page.getByRole('navigation', { name: 'Admin' });

    await sidebar.getByRole('link', { name: 'Payments' }).click();
    await expect(page.getByRole('heading', { name: 'Payments' })).toBeVisible();
    await expect(page.getByLabel('Status')).toBeVisible();

    await sidebar.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    // M9: the settings are tabs; a Super Admin lands on Users & roles.
    await expect(
      page.getByRole('link', { name: 'Approvals & thresholds' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Manifest & feature flags' }).click();
    await expect(page.getByText('MINTUR licence', { exact: true })).toBeVisible();
  });
});

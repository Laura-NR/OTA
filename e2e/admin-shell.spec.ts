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
    for (const section of ['Bookings', 'Packages', 'Customers', 'Suppliers', 'Reports']) {
      await expect(sidebar.getByRole('link', { name: section })).toBeVisible();
    }
    // Not built yet (design plan Phase 5): never a link to a missing page.
    for (const missing of ['Disruptions', 'Payments', 'Content', 'Settings']) {
      await expect(sidebar.getByRole('link', { name: missing })).toHaveCount(0);
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
});

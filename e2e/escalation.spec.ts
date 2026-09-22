import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test.describe('operations escalation', () => {
  test('opens the live desk and connects the /ops socket', async ({ page }) => {
    await signIn(page);
    await page.goto('/escalation');

    await expect(page.getByRole('heading', { name: 'Escalation' })).toBeVisible();
    await expect(page.getByText('socket connected')).toBeVisible();
  });
});

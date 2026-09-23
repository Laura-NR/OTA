import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

test.describe('operations messaging', () => {
  test('sends a message into the traveler conversation', async ({ page }) => {
    await signIn(page);

    // Resolve the fixture reservation id through the same-origin proxy.
    const response = await page.request.get('/api/ota/reservations');
    const reservations = (await response.json()) as { id: string; bookingCode: string }[];
    const target = reservations.find((row) => row.bookingCode === 'E2E0001');
    expect(target).toBeTruthy();

    await page.goto(`/messages?reservation=${target?.id}`);
    await expect(page.getByRole('heading', { name: 'Conversation' })).toBeVisible();

    const body = `e2e message ${Date.now()}`;
    await page.getByLabel('Message').fill(body);
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText(body)).toBeVisible();
  });

  test('drafts a contextual reply with the AI assistant', async ({ page }) => {
    await signIn(page);

    const response = await page.request.get('/api/ota/reservations');
    const reservations = (await response.json()) as { id: string; bookingCode: string }[];
    const target = reservations.find((row) => row.bookingCode === 'E2E0001');
    expect(target).toBeTruthy();

    await page.goto(`/messages?reservation=${target?.id}`);
    await page.getByRole('button', { name: 'Draft with AI' }).click();

    await expect(page.getByLabel('Message')).toHaveValue(/E2E0001/);
  });
});

import { expect, test } from '@playwright/test';

import { signIn } from './helpers';
import { watchTelemetry } from './telemetry';

test.describe('bookings', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('opens a booking from the list and applies a legal transition', async ({
    page,
  }) => {
    const sent = watchTelemetry(page);
    await page.goto('/bookings');
    await expect(page.getByRole('heading', { name: 'Bookings', level: 1 })).toBeVisible();

    const card = page.getByRole('link', { name: /E2E0001/ });
    await expect(card).toBeVisible();
    await card.click();

    await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: 'E2E0001' })).toBeVisible();
    await expect(page.getByText('DRAFT', { exact: true })).toBeVisible();

    const receipt = page.waitForResponse(
      (response) =>
        response.url().includes('/telemetry/events') &&
        (response.request().postData() ?? '').includes('booking_state_changed'),
    );
    await page.getByRole('button', { name: 'ITINERARY SUBMITTED' }).click();

    await expect(
      page.getByRole('button', { name: 'DISPATCH IN PROGRESS' }),
    ).toBeVisible();
    await expect(page.getByText('reservation.transition').first()).toBeVisible();

    // T-Events: an operational desk event, with no session id; the API
    // admits it only for a live staff session and adds the role itself.
    await expect.poll(() => sent.named('booking_state_changed').length).toBe(1);
    const [changed] = sent.named('booking_state_changed');
    expect(changed).toMatchObject({
      context: { app: 'admin', screen: 'A-Booking', consent: 'essential' },
      params: { booking_code: 'E2E0001', from: 'DRAFT', to: 'ITINERARY_SUBMITTED' },
    });
    expect(changed!.context).not.toHaveProperty('session_id');
    expect(changed!.context).not.toHaveProperty('role');
    const response = await receipt;
    const batch = (response.request().postDataJSON() as { events: unknown[] }).events;
    expect(await response.json()).toEqual({ accepted: batch.length, rejected: 0 });
  });

  test('signs out back to the login page', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

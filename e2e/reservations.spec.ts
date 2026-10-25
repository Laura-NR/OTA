import { expect, test } from '@playwright/test';

import { signIn } from './helpers';
import { SERVER_EVENTS_HINT, serverEvents, watchTelemetry } from './telemetry';

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

    const since = new Date();
    await page.getByRole('button', { name: 'ITINERARY SUBMITTED' }).click();

    await expect(
      page.getByRole('button', { name: 'DISPATCH IN PROGRESS' }),
    ).toBeVisible();
    await expect(page.getByText('reservation.transition').first()).toBeVisible();

    // T-Events: the API reports the transition itself, with the operator's
    // role as the actor and the trigger as the reason; the desk sends no
    // copy of it, so each move is counted once.
    const transitionOf = async () =>
      (await serverEvents(since)).filter(
        (event) =>
          event.event === 'booking_state_changed' &&
          event.params.booking_code === 'E2E0001',
      );
    await expect
      .poll(async () => (await transitionOf()).length, { message: SERVER_EVENTS_HINT })
      .toBe(1);
    const [changed] = await transitionOf();
    expect(changed).toMatchObject({
      context: { app: 'server', consent: 'essential' },
      params: {
        from: 'DRAFT',
        to: 'ITINERARY_SUBMITTED',
        actor: 'super_admin',
        reason: 'manual',
      },
    });
    expect(changed).toMatchObject({ userId: null });
    expect(sent.named('booking_state_changed')).toEqual([]);
  });

  test('signs out back to the login page', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

import { expect, test } from '@playwright/test';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';

interface MailpitMessage {
  ID: string;
  Subject: string;
  To?: { Address: string }[];
}

test.describe('storefront content pages', () => {
  test('links the content pages from the header and marks placeholder content', async ({
    page,
  }) => {
    await page.goto(`${STOREFRONT_URL}/en/packages`);
    const nav = page.getByRole('navigation', { name: 'Primary' });

    await nav.getByRole('link', { name: 'Travel info' }).click();
    await expect(page).toHaveURL(/\/en\/travel-info$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Cuba, as it is this month' }),
    ).toBeVisible();
    await expect(page.getByText('Sample content')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'E-visa & entry' })).toBeVisible();

    await nav.getByRole('link', { name: 'Blog & guides' }).click();
    await page.getByRole('link', { name: /Power outages in Cuba/ }).click();
    await expect(page).toHaveURL(/\/en\/blog\/power-outages-in-cuba$/);
    await expect(page.getByRole('navigation', { name: 'On this page' })).toBeVisible();

    await page.getByRole('contentinfo').getByRole('link', { name: 'About us' }).click();
    await expect(page).toHaveURL(/\/en\/about$/);
    await expect(page.getByRole('heading', { name: 'Licences & company' })).toBeVisible();

    await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/en\/legal\/privacy$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'How we use your data' }),
    ).toBeVisible();
  });

  test('sends the Support form to the agency inbox, after asking for consent', async ({
    page,
  }) => {
    await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' }).catch(
      () => undefined,
    );
    await page.goto(`${STOREFRONT_URL}/en/support`);
    await expect(page.getByRole('heading', { name: 'Emergency in Cuba' })).toBeVisible();

    // Client component: retry until hydration attaches the submit handler.
    await expect(async () => {
      await page.getByRole('button', { name: 'Send message' }).click();
      await expect(page.getByText('Enter your name.')).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await expect(page.getByLabel('Name')).toBeFocused();

    await page.getByLabel('Name').fill('E2E Visitor');
    await page.getByLabel('Email').fill('e2e-visitor@example.test');
    await page.getByLabel('Topic').selectOption('booking');
    await page
      .getByLabel('Message', { exact: true })
      .fill('Can we add a night in Viñales before the trip?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Tick the box so we can answer you.')).toBeVisible();

    await page.getByLabel(/uses these details to answer my message/).check();
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Your message is with the desk')).toBeVisible();

    await expect(async () => {
      const response = await fetch(`${MAILPIT_URL}/api/v1/messages`);
      const { messages } = (await response.json()) as { messages: MailpitMessage[] };
      const message = messages.find((candidate) =>
        candidate.Subject.includes('E2E Visitor'),
      );
      expect(message?.Subject).toContain('My booking');
    }).toPass();
  });

  test('answers an unknown path with the designed 404 and a way back', async ({
    page,
  }) => {
    const response = await page.goto(`${STOREFRONT_URL}/en/no-such-page`);
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: 'This page took a wrong turn.' }),
    ).toBeVisible();
    await expect(page.getByText('404 · /en/no-such-page')).toBeVisible();
  });
});

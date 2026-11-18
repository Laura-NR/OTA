import { expect, test } from '@playwright/test';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';

// The unprefixed path resolves via middleware locale detection; pin the browser
// to Spanish so the default-locale assertions are deterministic.
test.use({ locale: 'es' });

test.describe('storefront locales', () => {
  // The destination copy is tenant content, English until translated; the map
  // controls are core strings in every locale.
  test('switches the destinations page between es, en, and fr', async ({ page }) => {
    await page.goto(`${STOREFRONT_URL}/destinations`);
    await expect(page.getByRole('button', { name: 'Dónde operamos' })).toBeVisible();

    // Each locale link is named in its own language (the visible code is in the name).
    await page.getByRole('link', { name: 'English', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/destinations$/);
    await expect(page.getByRole('button', { name: 'Where we operate' })).toBeVisible();

    await page.getByRole('link', { name: 'Français', exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/destinations$/);
    await expect(page.getByRole('button', { name: 'Où nous opérons' })).toBeVisible();
  });

  // DS-Mobile-Patterns: on a phone the language is in the drawer, so the header row
  // (wordmark and menu) keeps its gutter at 320 px.
  test('on a phone the language moves from the header into the menu drawer', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${STOREFRONT_URL}/destinations`);
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: 'English', exact: true })).toBeHidden();

    // Retried: the first click may land before the menu button hydrates.
    const language = page.getByRole('region', { name: 'Idioma' });
    await expect(async () => {
      await header.getByRole('button', { name: 'Abrir el menú' }).click();
      await expect(language).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await expect(
      language.getByRole('link', { name: 'Español', exact: true }),
    ).toHaveAttribute('aria-current', 'true');

    await language.getByRole('link', { name: 'Français', exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/destinations$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Où nous opérons' })).toBeVisible();
  });
});

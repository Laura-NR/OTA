import { expect, test } from '@playwright/test';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';

test.describe('storefront destinations', () => {
  test('opens a province from the strip and reaches a destination with its live trip', async ({
    page,
  }) => {
    await page.goto(`${STOREFRONT_URL}/en/destinations`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Where our hosts are' }),
    ).toBeVisible();
    // Trip-planning pages carry the "Cuba right now" strip above the header.
    await expect(page.getByText('Cuba right now · advisory Level 2.')).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Map of Cuba by province' }),
    ).toBeVisible();

    // The strip is the keyboard and screen-reader control for the map.
    const panel = page.getByRole('complementary', { name: 'Province details' });
    await expect(async () => {
      await page.getByRole('button', { name: /^Sancti Spíritus ·/ }).click();
      await expect(panel.getByRole('heading', { name: 'Sancti Spíritus' })).toBeVisible({
        timeout: 1_000,
      });
    }).toPass();
    await expect(
      page.getByText('Showing Sancti Spíritus · 2 destinations.'),
    ).toBeVisible();

    await page.getByRole('link', { name: /^Trinidad & Topes de Collantes:/ }).click();
    await expect(page).toHaveURL(/\/en\/destinations\/trinidad$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Trinidad & Topes de Collantes' }),
    ).toBeVisible();
    // The destination lists the live package the tenant data links to it.
    await expect(
      page.getByRole('heading', { name: 'Trinidad Heritage Trail' }),
    ).toBeVisible();
  });

  test('sketches a route and warns about a long leg and a limited province', async ({
    page,
  }) => {
    await page.goto(`${STOREFRONT_URL}/en/destinations`);
    const panel = page.getByRole('complementary', { name: 'Province details' });
    await expect(async () => {
      await page.getByRole('button', { name: 'Plan a route' }).click();
      await expect(panel.getByRole('heading', { name: 'Sketch a route' })).toBeVisible({
        timeout: 1_000,
      });
    }).toPass();

    await page.getByRole('button', { name: /^La Habana ·/ }).click();
    await page.getByRole('button', { name: /^Guantánamo ·/ }).click();
    await expect(panel.getByText('930 km · ≈ 16.9 h driving')).toBeVisible();
    await expect(panel.getByText(/One leg is over 600 km/)).toBeVisible();
    await expect(panel.getByText(/A stop is in a limited province/)).toBeVisible();
  });

  test('keeps old catalogue links working by opening the named province', async ({
    page,
  }) => {
    await page.goto(`${STOREFRONT_URL}/en/catalog?province=La+Habana`);
    await expect(page).toHaveURL(/\/en\/destinations\?province=La(\+|%20)Habana$/);
    await expect(
      page
        .getByRole('complementary', { name: 'Province details' })
        .getByRole('heading', { name: 'La Habana' }),
    ).toBeVisible();
  });
});

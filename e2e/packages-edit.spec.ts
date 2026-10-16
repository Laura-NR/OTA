import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

// A 1×1 PNG: enough for the API to store and serve.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('curated package editor', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('opens a package and saves its itinerary', async ({ page }) => {
    await page.goto('/packages');

    const link = page.getByRole('link', { name: 'Trinidad Heritage Trail' });
    await expect(link).toBeVisible();
    await link.click();

    await expect(
      page.getByRole('heading', { name: 'Trinidad Heritage Trail' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Itinerary' })).toBeVisible();
    // M1: the editor carries the tiers, departures, extras and day texts.
    await expect(
      page.getByRole('heading', { name: 'Accommodation tiers' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Departures' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Optional extras' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Day texts' })).toBeVisible();

    // Re-saving the seeded price is a no-op that exercises the replace-all PATCH.
    await page.getByLabel('Base price').fill('240.00');
    await page.getByRole('button', { name: 'Save package' }).click();

    await expect(page.getByText('Package saved.')).toBeVisible();
  });

  test.afterAll(async () => {
    // The translation draft this suite writes; photos are removed in the test.
    await prisma.packageTranslation.deleteMany({
      where: { package: { slug: 'trinidad-heritage-trail' }, locale: 'es' },
    });
    await prisma.$disconnect();
  });

  test('uploads and removes a photo, and saves a translation draft', async ({ page }) => {
    await page.goto('/packages');
    await page.getByRole('link', { name: 'Trinidad Heritage Trail' }).click();
    await expect(
      page.getByRole('heading', { name: 'Trinidad Heritage Trail' }),
    ).toBeVisible();

    // The tabs are a client component; retry the first pre-hydration click.
    await expect(async () => {
      await page.getByRole('tab', { name: 'Photos' }).click();
      await expect(page.getByLabel('Alt text')).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await page
      .getByLabel('Photo', { exact: true })
      .setInputFiles({ name: 'plaza.png', mimeType: 'image/png', buffer: PIXEL });
    await page.getByLabel('Alt text').fill('Plaza Mayor at dusk');
    await page.getByRole('button', { name: 'Upload photo' }).click();
    const photos = page.getByRole('tabpanel', { name: 'Photos' });
    await expect(photos.getByText('Hero', { exact: true })).toBeVisible();
    await expect(photos.getByRole('img', { name: 'Plaza Mayor at dusk' })).toBeVisible();
    await photos.getByRole('button', { name: 'Remove' }).click();
    await expect(photos.getByText('No photos yet.')).toBeVisible();

    await page.getByRole('tab', { name: 'Translations' }).click();
    const translations = page.getByRole('tabpanel', { name: 'Translations' });
    await translations.getByLabel('Language', { exact: true }).selectOption('es');
    await translations
      .getByLabel('Name', { exact: true })
      .fill('Ruta del patrimonio de Trinidad');
    await translations.getByRole('button', { name: 'Save translation' }).click();
    await expect(translations.getByText('Translation saved.')).toBeVisible();
    await expect(translations.getByText('ES · draft')).toBeVisible();
  });
});

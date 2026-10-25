import { PrismaClient } from '@ota/db';
import { expect, test, type Page } from '@playwright/test';

import { signIn } from './helpers';

/**
 * Display preferences kept on the device (Account board "Accessibility &
 * data"; DS 05 text-only mode): larger text, reduce motion, high contrast,
 * low-bandwidth mode with photos on tap and system fonts, and the
 * slow-connection offer. The spec owns one
 * photo, alt text "E2E display photo", on an active Havana catalogue item.
 */
const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const PHOTO_ALT = 'E2E display photo';
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const prisma = new PrismaClient();

/** A computed colour as `r, g, b` (0–255), whether the browser wrote `rgb()` or `color(srgb …)`. */
const rgb = (value: string) => {
  const channels = (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const scale = value.startsWith('color(') ? 255 : 1;
  return channels.map((channel) => Math.round(channel * scale)).join(', ');
};

const bodyFontSize = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).fontSize);

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('storefront display preferences', () => {
  test('larger text from the menu drawer gives an 18 px body that survives a reload', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${STOREFRONT_URL}/en`);
    expect(await bodyFontSize(page)).toBe('16px');

    await page.getByRole('button', { name: 'Open menu' }).click();
    const largeText = page.getByRole('switch', { name: 'Larger text (18 px)' });
    await expect(largeText).toHaveAttribute('aria-checked', 'false');
    await largeText.click();
    await expect(largeText).toHaveAttribute('aria-checked', 'true');
    expect(await bodyFontSize(page)).toBe('18px');

    // The device keeps it: the next page renders large from its first byte.
    await page.goto(`${STOREFRONT_URL}/en/travel-info`);
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
    expect(await bodyFontSize(page)).toBe('18px');
  });

  test('reduce motion from the menu drawer stops transitions on every page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${STOREFRONT_URL}/en`);
    await page.getByRole('button', { name: 'Open menu' }).click();
    const reduceMotion = page.getByRole('switch', { name: 'Reduce motion' });
    const transition = () =>
      reduceMotion.evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(await transition()).not.toBe('0s');

    await reduceMotion.click();
    await expect(reduceMotion).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
    expect(await transition()).toBe('0s');

    await page.goto(`${STOREFRONT_URL}/en/travel-info`);
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  });

  test('high contrast darkens secondary text, borders and the off switch', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${STOREFRONT_URL}/en`);
    await page.getByRole('button', { name: 'Open menu' }).click();
    const help = page
      .getByText('Darker text and borders', { exact: true })
      .filter({ visible: true });
    const offSwitch = page.getByRole('switch', { name: 'Larger text (18 px)' });
    const colour = async () =>
      rgb(await help.evaluate((element) => getComputedStyle(element).color));
    const track = async () =>
      rgb(
        await offSwitch.evaluate((element) => getComputedStyle(element).backgroundColor),
      );
    // neutral 700 text and a neutral 300 track by default
    await expect.poll(colour).toBe('74, 67, 61');
    await expect.poll(track).toBe('214, 206, 195');

    await page.getByRole('switch', { name: 'High contrast' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'more');
    // neutral 900 text and a neutral 500 track
    await expect.poll(colour).toBe('31, 27, 23');
    await expect.poll(track).toBe('110, 102, 94');

    await page.goto(`${STOREFRONT_URL}/en/travel-info`);
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'more');
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-border')
          .trim(),
      ),
    ).toBe('#6e665e');
  });

  test('high contrast also follows the system setting', async ({ page }) => {
    await page.emulateMedia({ contrast: 'more' });
    await page.goto(`${STOREFRONT_URL}/en/travel-info`);
    await expect(page.locator('html')).not.toHaveAttribute('data-contrast', 'more');
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-text-muted')
          .trim(),
      ),
    ).toBe('#4a433d');
  });

  test.describe('low-bandwidth mode', () => {
    let itemId = '';
    let mediaId = '';

    test.beforeAll(async ({ browser }) => {
      const item = await prisma.inventoryItem.findFirstOrThrow({
        where: { active: true, province: 'La Habana' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      itemId = item.id;
      const desk = await browser.newPage();
      await signIn(desk);
      const response = await desk.request.post(`/api/ota/inventory/${itemId}/media`, {
        data: { contentType: 'image/png', contentBase64: PNG_1X1, altText: PHOTO_ALT },
      });
      expect(response.ok()).toBe(true);
      mediaId = ((await response.json()) as { id: string }).id;
      await desk.close();
    });

    test.afterAll(async ({ browser }) => {
      if (!mediaId) {
        return;
      }
      const desk = await browser.newPage();
      await signIn(desk);
      await desk.request.delete(`/api/ota/inventory/${itemId}/media/${mediaId}`);
      await desk.close();
    });

    test('turns photos into "Load photo" buttons until tapped', async ({ page }) => {
      await signIn(page, 'traveler@example.test', {
        origin: STOREFRONT_URL,
        callbackPath: '/en/account?tab=preferences',
      });
      await expect(page.getByRole('heading', { name: 'Display' })).toBeVisible();
      await page.getByRole('switch', { name: 'Low-bandwidth mode' }).click();
      await expect(
        page.getByText('Text-only mode on · photos load on tap'),
      ).toBeVisible();

      const photo = page.locator(`img[alt="${PHOTO_ALT}"]`);
      const load = page.getByRole('button', { name: `Load photo: ${PHOTO_ALT}` });
      // The public catalogue is cached for 60 s, so the new photo may lag.
      await expect(async () => {
        await page.goto(`${STOREFRONT_URL}/en/destinations/havana`);
        await expect(load).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 90_000 });
      await expect(photo).toHaveCount(0);
      await load.click();
      await expect(photo).toBeVisible();

      await page.getByRole('button', { name: 'Turn off' }).click();
      await expect(page.getByText('Text-only mode on · photos load on tap')).toHaveCount(
        0,
      );
      await page.reload();
      await expect(photo).toBeVisible();
      await expect(load).toHaveCount(0);
    });
  });

  test('a page in low-bandwidth mode never downloads the brand fonts', async ({
    page,
  }) => {
    // A fresh device with the mode on: an earlier page's memory cache would
    // replay its fonts as zero-byte requests.
    await page
      .context()
      .addCookies([{ name: 'ota_display', value: 'low-bandwidth', url: STOREFRONT_URL }]);
    const fonts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'font') {
        fonts.push(request.url());
      }
    });
    await page.goto(`${STOREFRONT_URL}/en/destinations/havana`);
    await expect(page.locator('html')).toHaveAttribute('data-bandwidth', 'low');
    expect(
      await page.evaluate(() => getComputedStyle(document.body).fontFamily),
    ).toContain('system-ui');
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    expect(fonts).toEqual([]);
  });

  test('a slow connection offers text-only mode once', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { downlink: 0.1, effectiveType: '2g', saveData: false },
      });
    });
    await page.goto(`${STOREFRONT_URL}/en`);
    const offer = page.getByRole('region', { name: 'Low-bandwidth mode' });
    await expect(offer).toContainText('Your connection looks slow.');

    await offer.getByRole('button', { name: 'Not now' }).click();
    await expect(offer).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('Your connection looks slow.')).toHaveCount(0);

    await page.context().clearCookies();
    await page.reload();
    await offer.getByRole('button', { name: 'Turn on' }).click();
    await expect(page.getByText('Text-only mode on · photos load on tap')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-bandwidth', 'low');
  });
});

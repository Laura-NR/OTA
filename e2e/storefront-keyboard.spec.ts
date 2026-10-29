import { expect, test, type Page } from '@playwright/test';

import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';

/**
 * The storefront's manual pass on DS 02–05 (2026-10-29), the checks axe cannot
 * decide: the skip link, focus never hidden under the sticky header or the
 * phone's bottom bar (WCAG 2.4.11), 44 px targets on a touch screen, locale
 * links named in their own language, page titles and a named scroll box.
 */

/** What covers the focused element's centre, or null when it is visible. */
function focusCover(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), innerWidth - 1);
    const y = Math.min(Math.max(rect.top + rect.height / 2, 0), innerHeight - 1);
    const top = document.elementFromPoint(x, y);
    // Next's dev indicator is not part of the page.
    if (!top || top.closest('nextjs-portal')) {
      return null;
    }
    return element === top || element.contains(top) || top.contains(element)
      ? null
      : `"${element.textContent?.trim().slice(0, 40)}" under ${top.tagName.toLowerCase()} in ${top.closest('header,nav,footer')?.tagName.toLowerCase() ?? 'page'}`;
  });
}

/** Tab (or Shift+Tab) through the page, collecting every hidden focus stop. */
async function walk(page: Page, key: 'Tab' | 'Shift+Tab', stops: number) {
  const hidden: string[] = [];
  for (let index = 0; index < stops; index += 1) {
    await page.keyboard.press(key);
    const cover = await focusCover(page);
    if (cover) {
      hidden.push(cover);
    }
  }
  return hidden;
}

test.describe('storefront keyboard paths (DS 02–05)', () => {
  test('the skip link is the first stop and moves focus to the page', async ({
    page,
  }) => {
    await page.goto(`${STOREFRONT_URL}/en/packages`);
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  test('Shift+Tab never leaves focus under the sticky header', async ({ page }) => {
    await page.goto(`${STOREFRONT_URL}/en/support`);
    await page.waitForLoadState('networkidle');
    await page.locator('footer a').last().focus();
    expect(await walk(page, 'Shift+Tab', 45)).toEqual([]);
  });

  test('locale links are named in their own language; the current one is marked', async ({
    page,
  }) => {
    await page.goto(`${STOREFRONT_URL}/en`);
    const english = page.getByRole('link', { name: 'English', exact: true });
    await expect(english).toHaveAttribute('aria-current', 'true');
    await expect(english).toHaveAttribute('lang', 'en');
    await expect(
      page.getByRole('link', { name: 'Español', exact: true }),
    ).toHaveAttribute('lang', 'es');
  });

  test('a mouse keeps the compact 40 px field', async ({ page }) => {
    await page.goto(`${STOREFRONT_URL}/en/support`);
    const name = page.getByLabel('Name', { exact: true });
    expect((await name.boundingBox())?.height).toBe(40);
  });

  test('pages are titled, and a trip names its scrolling itinerary', async ({ page }) => {
    await page.goto(`${STOREFRONT_URL}/en/no-such-page`);
    await expect(page).toHaveTitle('Page not found');

    await signIn(page, 'traveler@example.test', {
      origin: STOREFRONT_URL,
      callbackPath: '/en/account?tab=trips',
    });
    await page.getByRole('link', { name: 'DEMO0001' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'DEMO0001' })).toBeVisible();
    await expect(page).toHaveTitle('Your trip');
    await expect(page.getByRole('region', { name: 'Itinerary · table' })).toBeVisible();
  });
});

test.describe('storefront on a touch phone (DS 05)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Tab never leaves focus under the bottom bar', async ({ page }) => {
    await page.goto(`${STOREFRONT_URL}/en`);
    await page.waitForLoadState('networkidle');
    expect(await walk(page, 'Tab', 45)).toEqual([]);
  });

  test('controls and stand-alone links reach 44 px', async ({ page }) => {
    await page.goto(`${STOREFRONT_URL}/en/support`);
    const heights = {
      field: (await page.getByLabel('Name', { exact: true }).boundingBox())?.height,
      button: (await page.getByRole('button', { name: 'Send message' }).boundingBox())
        ?.height,
      footer: (
        await page.locator('footer').getByRole('link', { name: 'FAQ' }).boundingBox()
      )?.height,
    };
    expect(heights.field).toBeGreaterThanOrEqual(44);
    expect(heights.button).toBeGreaterThanOrEqual(44);
    expect(heights.footer).toBeGreaterThanOrEqual(44);

    // The locale pill keeps its look; a tap 10 px above it still lands on it.
    const english = page.getByRole('link', { name: 'English', exact: true });
    const box = await english.boundingBox();
    expect(box?.height).toBeLessThan(44);
    const tapped = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.getAttribute('lang'),
      [box!.x + box!.width / 2, box!.y - 10],
    );
    expect(tapped).toBe('en');
  });
});

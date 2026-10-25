import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { ANALYTICS_WORDS_VERSION, consentCookieValue } from './consent';
import { signIn } from './helpers';
import { watchTelemetry } from './telemetry';

/**
 * T-Events (Phase 8 item 1) and the DS 04 cookie choice. Every other spec
 * starts with the choice made (playwright.config.ts); these clear it. Only
 * batches sent with fetch are read: a beacon's body (a page being left) is
 * not visible to Playwright.
 */
const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const TRAVELER = 'traveler@example.test';

const prisma = new PrismaClient();

async function deleteBannerConsents() {
  await prisma.consentRecord.deleteMany({
    where: { user: { email: TRAVELER }, source: 'COOKIE_BANNER' },
  });
}

test.afterAll(async () => {
  await deleteBannerConsents();
  await prisma.$disconnect();
});

test.describe('cookie choice and T-Events', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies({ name: 'ota_consent' });
  });

  test('the banner asks once; Reject keeps analytics off and sends only essential events', async ({
    page,
    context,
  }) => {
    const sent = watchTelemetry(page);
    await page.goto(`${STOREFRONT_URL}/en`);

    const banner = page.getByRole('region', { name: 'Cookies, your choice' });
    await expect(banner).toBeVisible();
    // No pre-ticked boxes; Reject and Accept are equally weighted.
    await expect(banner.getByRole('switch', { name: 'Analytics' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    const reject = banner.getByRole('button', { name: 'Reject non-essential' });
    const accept = banner.getByRole('button', { name: 'Accept all' });
    expect(await reject.getAttribute('class')).toBe(await accept.getAttribute('class'));

    await expect(async () => {
      await reject.click();
      await expect(banner).toBeHidden({ timeout: 2_000 });
    }).toPass();

    await expect.poll(() => sent.named('consent_set').length).toBe(1);
    const [choice] = sent.named('consent_set');
    expect(choice!.params).toEqual({
      analytics: false,
      marketing: false,
      source: 'banner',
    });
    expect(choice!.context.consent).toBe('essential');
    expect(choice!.context).not.toHaveProperty('session_id');
    const cookie = (await context.cookies()).find((item) => item.name === 'ota_consent');
    expect(new URLSearchParams(decodeURIComponent(cookie!.value)).get('a')).toBe('0');

    // The choice holds: no banner on the next page, and no analytics event.
    await page.goto(`${STOREFRONT_URL}/en/packages`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(banner).toHaveCount(0);
    await page.waitForTimeout(3_000);
    expect(sent.events.map((event) => event.event)).toEqual(['consent_set']);
    expect(sent.receipts.every((receipt) => receipt.status === 202)).toBe(true);
  });

  test('Accept all sends the funnel events with the common parameters, and the sink takes them', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const sent = watchTelemetry(page);
    await page.goto(`${STOREFRONT_URL}/en/packages`);

    const banner = page.getByRole('region', { name: 'Cookies, your choice' });
    await expect(async () => {
      await banner.getByRole('button', { name: 'Accept all' }).click();
      await expect(banner).toBeHidden({ timeout: 2_000 });
    }).toPass();

    // This screen's view is the tab's entry, counted once the visitor allows it.
    await expect.poll(() => sent.named('page_view').length).toBe(1);
    const [view] = sent.named('page_view');
    expect(view!.params).toMatchObject({ entry: true });
    expect(view!.context).toMatchObject({
      app: 'web',
      screen: 'Packages',
      locale: 'en',
      currency: 'EUR',
      device_type: 'desktop',
      viewport: 'xl',
      consent: 'analytics',
    });
    expect(view!.context.session_id).toMatch(/^s_[0-9a-f]{16}$/);

    // Discover: a filter, then a result opened from the list.
    await page
      .getByRole('group', { name: 'Where' })
      .first()
      .getByRole('checkbox')
      .first()
      .check();
    await expect.poll(() => sent.named('filter_applied').length).toBe(1);
    expect(sent.named('filter_applied')[0]!.params).toMatchObject({
      filter_name: 'province',
      active_filters_count: 1,
    });
    expect(sent.named('search_results_loaded').at(-1)!.params).toMatchObject({
      zero_results: false,
    });

    await page
      .getByRole('article')
      .first()
      .getByRole('link', { name: 'View trip' })
      .click();
    await page.waitForURL(/\/en\/packages\/[^/]+$/);
    await expect.poll(() => sent.named('package_viewed').length).toBe(1);
    const slug = new URL(page.url()).pathname.split('/').at(-1);
    expect(sent.named('search_result_clicked')[0]!.params).toEqual({
      package_id: slug,
      position: 1,
    });
    expect(sent.named('package_viewed')[0]).toMatchObject({
      context: { screen: 'Package' },
      params: { package_id: slug, booking_model: 'request', currency: 'EUR' },
    });

    // Every batch was admitted whole, and nothing personal rode along.
    await expect
      .poll(() =>
        sent.receipts.reduce((sum, receipt) => sum + (receipt.accepted ?? 0), 0),
      )
      .toBe(sent.events.length);
    expect(sent.receipts.every((receipt) => receipt.rejected === 0)).toBe(true);
    expect(JSON.stringify(sent.events)).not.toContain('@');
  });

  test('Cookie settings shows the saved choice, changes it and lists what is stored', async ({
    page,
    context,
  }) => {
    await page.goto(`${STOREFRONT_URL}/en/legal/cookies`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Cookie settings' }),
    ).toBeVisible();
    // The page is the settings: the banner does not cover it.
    await expect(page.getByRole('region', { name: 'Cookies, your choice' })).toHaveCount(
      0,
    );
    await expect(page.getByText('You have not chosen yet')).toBeVisible();
    const stored = page.getByRole('region', { name: 'Cookies and storage we use' });
    await expect(stored.getByRole('cell', { name: 'ota_consent' })).toBeVisible();
    await expect(
      stored.getByRole('cell', { name: 'ota_telemetry_session' }),
    ).toBeVisible();

    const analytics = page.getByRole('switch', { name: 'Analytics' });
    await expect(async () => {
      await analytics.click();
      await expect(analytics).toHaveAttribute('aria-checked', 'true', { timeout: 2_000 });
    }).toPass();
    await page.getByRole('button', { name: 'Save my selection' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    await expect(page.getByText('Your current choice was saved on')).toBeVisible();
    const cookie = (await context.cookies()).find((item) => item.name === 'ota_consent');
    const saved = new URLSearchParams(decodeURIComponent(cookie!.value));
    expect(saved.get('a')).toBe('1');
    expect(saved.get('av')).toBe(ANALYTICS_WORDS_VERSION);
  });

  test("a signed-in traveler's choice is written to the consent log", async ({
    page,
  }) => {
    await deleteBannerConsents();
    await signIn(page, TRAVELER, { origin: STOREFRONT_URL, callbackPath: '/en/account' });
    await page.goto(`${STOREFRONT_URL}/en`);

    const banner = page.getByRole('region', { name: 'Cookies, your choice' });
    await expect(async () => {
      await banner.getByRole('button', { name: 'Accept all' }).click();
      await expect(banner).toBeHidden({ timeout: 2_000 });
    }).toPass();

    await expect
      .poll(() =>
        prisma.consentRecord.findFirst({
          where: { user: { email: TRAVELER }, source: 'COOKIE_BANNER' },
          select: { purpose: true, granted: true, textVersion: true, locale: true },
        }),
      )
      .toEqual({
        purpose: 'COOKIES_ANALYTICS',
        granted: true,
        textVersion: ANALYTICS_WORDS_VERSION,
        locale: 'en',
      });
  });
});

test.describe('T-Events follow-ups, with analytics allowed', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: 'ota_consent',
        value: consentCookieValue(true),
        domain: 'localhost',
        path: '/',
        sameSite: 'Lax',
      },
    ]);
  });

  test('the Home search and the Packages sort are reported, with no typed text', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const sent = watchTelemetry(page);
    await page.goto(`${STOREFRONT_URL}/en`);

    const search = page.getByRole('form', { name: 'Search trips' });
    await search.getByLabel('Where do you want to go?').fill('Trinidad Jane');
    // Retried until the shell has hydrated and caught the submit.
    await expect(async () => {
      await search.getByLabel('Where do you want to go?').press('Enter');
      await page.waitForURL(/\/en\/packages\?q=/, { timeout: 5_000 });
      expect(sent.named('search_submitted').length).toBeGreaterThan(0);
    }).toPass();
    expect(sent.named('search_submitted')[0]!.params).toEqual({});
    expect(sent.named('search_submitted')[0]!.context).toMatchObject({ screen: 'Home' });

    await expect(async () => {
      await page.getByLabel('Sort by').selectOption('price-asc');
      await expect.poll(() => sent.named('sort_changed').length).toBeGreaterThan(0);
    }).toPass();
    expect(sent.named('sort_changed').at(-1)!.params).toEqual({
      sort_field: 'price',
      direction: 'asc',
    });

    await expect
      .poll(() =>
        sent.receipts.reduce((sum, receipt) => sum + (receipt.rejected ?? 0), 0),
      )
      .toBe(0);
    expect(JSON.stringify(sent.events)).not.toContain('Jane');
  });

  test('the Booking form reports the departure, the tier and the OFAC gate', async ({
    page,
  }) => {
    await signIn(page, TRAVELER, {
      origin: STOREFRONT_URL,
      callbackPath: '/en/packages/trinidad-heritage-trail/book',
    });
    const sent = watchTelemetry(page);
    await page.goto(`${STOREFRONT_URL}/en/packages/trinidad-heritage-trail/book`);
    await expect(
      page.getByRole('heading', { level: 1, name: "When, and who's coming?" }),
    ).toBeVisible();

    // Step 1: the second open departure (retried until the form hydrates).
    const departure = page.getByLabel('Departure');
    const second = await departure.locator('option').nth(1).getAttribute('value');
    await expect(async () => {
      await departure.selectOption(second!);
      expect(sent.named('departure_selected').length).toBeGreaterThan(0);
    }).toPass();
    expect(sent.named('departure_selected')[0]!.params).toMatchObject({
      package_id: 'trinidad-heritage-trail',
      departure_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as unknown,
    });
    await page.getByRole('button', { name: 'Continue to stay' }).click();

    // Step 2: a tier, by its id with its price difference.
    await page.getByRole('radio', { name: 'Comfort' }).check();
    await expect.poll(() => sent.named('tier_selected').length).toBe(1);
    expect(sent.named('tier_selected')[0]!.params).toMatchObject({
      package_id: 'trinidad-heritage-trail',
      tier: expect.stringMatching(/^[0-9a-z-]+$/) as unknown,
      delta: expect.any(Number) as unknown,
    });
    await page.getByRole('button', { name: 'Continue to extras' }).click();
    await page.getByRole('button', { name: 'Continue to traveler details' }).click();

    // Step 4: a US lead opens the gate; a missing signature holds it.
    const lead = page.getByRole('region', {
      name: 'Traveler 1 · lead traveler',
      exact: true,
    });
    await lead.getByLabel('Nationality (passport)').selectOption('US');
    await lead.getByLabel('Travel category').selectOption('FAMILY_VISITS');
    await page.getByRole('button', { name: 'Review your request' }).click();
    await expect.poll(() => sent.named('ofac_gate_shown').length).toBe(2);
    expect(sent.named('ofac_gate_shown').map((event) => event.params)).toEqual([
      { blocked: false },
      { blocked: true },
    ]);
    expect(sent.named('ofac_category_selected')[0]!.params).toEqual({
      category: 'FAMILY_VISITS',
    });
    // Nothing was submitted, so no affidavit was signed.
    expect(sent.named('affidavit_signed')).toEqual([]);
    await expect
      .poll(() =>
        sent.receipts.reduce((sum, receipt) => sum + (receipt.rejected ?? 0), 0),
      )
      .toBe(0);
  });
});

import { PrismaClient } from '@ota/db';
import { expect, test, type Page } from '@playwright/test';

import { ANALYTICS_WORDS_VERSION } from './consent';
import { signIn } from './helpers';

/**
 * T-Events (Phase 8 item 1) and the DS 04 cookie choice. Every other spec
 * starts with the choice made (playwright.config.ts); these clear it. Only
 * batches sent with fetch are read: a beacon's body (a page being left) is
 * not visible to Playwright.
 */
const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const TRAVELER = 'traveler@example.test';

const prisma = new PrismaClient();

interface SentEvent {
  event: string;
  context: Record<string, string>;
  params: Record<string, unknown>;
}

/** The events the page sends and the sink's receipts for them. */
function watchTelemetry(page: Page) {
  const events: SentEvent[] = [];
  const receipts: { status: number; accepted?: number; rejected?: number }[] = [];
  page.on('request', (request) => {
    if (!request.url().includes('/telemetry/events')) {
      return;
    }
    const body = request.postDataBuffer();
    if (body) {
      events.push(...(JSON.parse(body.toString()) as { events: SentEvent[] }).events);
    }
  });
  page.on('response', (response) => {
    if (response.url().includes('/telemetry/events')) {
      void response
        .json()
        .then((body: { accepted: number; rejected: number }) =>
          receipts.push({ status: response.status(), ...body }),
        )
        .catch(() => receipts.push({ status: response.status() }));
    }
  });
  const named = (name: string) => events.filter((event) => event.event === name);
  return { events, receipts, named };
}

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

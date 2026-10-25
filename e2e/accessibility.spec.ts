import AxeBuilder from '@axe-core/playwright';
import { PrismaClient } from '@ota/db';
import { expect, test, type Page } from '@playwright/test';

import { signIn } from './helpers';

/**
 * Automated accessibility audit (A-A11y: WCAG 2.2 AA) with axe-core: every
 * customer page signed out and signed in, the customer pages again at phone
 * width with larger text and high contrast, and the desk. axe finds what a
 * rule can decide (names, roles, contrast, landmarks, ARIA); keyboard paths,
 * focus order and reading order stay with the manual checks on the boards.
 */
const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

interface Finding {
  rule: string;
  impact: string | null | undefined;
  help: string;
  targets: string[];
}

/** axe's violations on the current page, reduced to what a reader can act on. */
async function audit(page: Page): Promise<Finding[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  return results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.slice(0, 5).map((node) => node.target.join(' ')),
  }));
}

/**
 * Ids used more than once on the page. axe only flags a repeated id that ARIA
 * references as "needs review", but a repeat makes `aria-labelledby` and
 * `<label for>` point at whichever copy comes first.
 */
function duplicateIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seen = new Map<string, number>();
    for (const element of Array.from(document.querySelectorAll('[id]'))) {
      seen.set(element.id, (seen.get(element.id) ?? 0) + 1);
    }
    return [...seen].filter(([, count]) => count > 1).map(([id]) => id);
  });
}

/** Audits each path; soft, so one run lists every page's violations. */
async function expectAccessible(page: Page, origin: string, paths: string[]) {
  for (const path of paths) {
    await page.goto(`${origin}${path}`);
    await page.waitForLoadState('networkidle');
    expect.soft(await audit(page), `${path} has axe violations`).toEqual([]);
    expect.soft(await duplicateIds(page), `${path} repeats ids`).toEqual([]);
  }
}

/** The public customer pages, with the first published package. */
async function customerPaths(): Promise<string[]> {
  const packageSlug = (
    await prisma.package.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'asc' },
      select: { slug: true },
    })
  )?.slug;
  return [
    '/en',
    '/en/destinations',
    '/en/destinations/havana',
    '/en/packages',
    ...(packageSlug ? [`/en/packages/${packageSlug}`] : []),
    '/en/packages/compare',
    '/en/events',
    '/en/events/havana-jazz-festival-2027',
    '/en/travel-info',
    '/en/blog',
    '/en/blog/power-outages-in-cuba',
    '/en/about',
    '/en/support',
    '/en/legal/privacy',
    '/en/login',
    '/en/offline',
    '/join',
    '/en/no-such-page',
  ];
}

test.describe('accessibility audit (WCAG 2.2 AA, axe)', () => {
  test('customer pages', async ({ page }) => {
    test.setTimeout(300_000);
    await expectAccessible(page, STOREFRONT_URL, await customerPaths());
  });

  test('customer pages at phone width with larger text and high contrast', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.context().addCookies([
      {
        name: 'ota_display',
        value: 'large-text.reduce-motion.high-contrast',
        url: STOREFRONT_URL,
      },
    ]);
    await expectAccessible(page, STOREFRONT_URL, await customerPaths());

    // The menu drawer, with the four display switches, open.
    await page.goto(`${STOREFRONT_URL}/en`);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('switch', { name: 'High contrast' })).toBeVisible();
    expect.soft(await audit(page), 'the open menu has axe violations').toEqual([]);
  });

  test('the traveler account, a trip, a booking and the builder', async ({ page }) => {
    test.setTimeout(180_000);
    const [reservation, pkg] = await Promise.all([
      prisma.reservation.findFirst({
        where: { bookingCode: 'DEMO0001' },
        select: { id: true },
      }),
      prisma.package.findFirst({
        where: { status: 'PUBLISHED' },
        orderBy: { createdAt: 'asc' },
        select: { slug: true },
      }),
    ]);
    await signIn(page, 'traveler@example.test', {
      origin: STOREFRONT_URL,
      callbackPath: '/en/account',
    });
    await expectAccessible(page, STOREFRONT_URL, [
      '/en/account',
      ...(reservation ? [`/en/account/reservations/${reservation.id}`] : []),
      ...(pkg ? [`/en/packages/${pkg.slug}/book`] : []),
      '/en/custom',
    ]);
  });

  test('desk pages', async ({ page, baseURL }) => {
    test.setTimeout(300_000);
    const [reservation, customer, supplier, pkg] = await Promise.all([
      prisma.reservation.findFirst({
        where: { bookingCode: 'DEMO0001' },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { email: 'traveler@example.test' },
        select: { id: true },
      }),
      prisma.supplierProfile.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }),
      prisma.package.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } }),
    ]);
    await signIn(page);
    await expectAccessible(page, baseURL ?? '', [
      '/dashboard',
      '/bookings',
      ...(reservation ? [`/bookings/${reservation.id}`] : []),
      '/bookings/new',
      '/bookings/proposals',
      '/bookings/messages',
      '/bookings/documents',
      '/bookings/event-requests',
      '/disruptions',
      '/packages',
      ...(pkg ? [`/packages/${pkg.id}`] : []),
      '/packages/inventory',
      '/packages/imports',
      '/customers',
      ...(customer ? [`/customers/${customer.id}`] : []),
      '/customers/retention',
      '/suppliers',
      ...(supplier ? [`/suppliers/${supplier.id}`] : []),
      '/suppliers/applications',
      '/payments',
      '/content',
      '/content/advisories',
      '/content/events',
      '/reports',
      '/settings',
    ]);
  });

  test('the desk sign-in page', async ({ page, baseURL }) => {
    await expectAccessible(page, baseURL ?? '', ['/login']);
  });
});

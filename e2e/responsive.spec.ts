import { PrismaClient } from '@ota/db';
import { expect, test, type Page } from '@playwright/test';

import { signIn } from './helpers';

/**
 * DS 07 (DS-Responsive): no page scrolls sideways at the test widths, and type
 * does not scale with the viewport (16 px body on customer pages, 14 px on the
 * desk). Each `ds07-<width>` project in playwright.config.ts runs this file at
 * one width; the desk is a laptop tool, so it is checked from 768 up.
 */
const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const DESK_MIN_WIDTH = 768;

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

interface Layout {
  overflow: number;
  bodyFontSize: string;
  offenders: string[];
}

/** How far the page scrolls sideways, and the elements that stick out. */
async function measure(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const width = root.clientWidth;
    const offenders: string[] = [];
    for (const element of Array.from(document.body.querySelectorAll('*'))) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.right <= width + 1) {
        continue;
      }
      // An element inside a box that clips or scrolls does not move the page.
      let clipped = false;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const { overflowX } = getComputedStyle(parent);
        if (overflowX !== 'visible') {
          clipped = true;
          break;
        }
      }
      if (!clipped) {
        const id = element.id ? `#${element.id}` : '';
        const cls =
          typeof element.className === 'string'
            ? `.${element.className.trim().split(/\s+/).slice(0, 4).join('.')}`
            : '';
        offenders.push(
          `${element.tagName.toLowerCase()}${id}${cls} → ${Math.round(rect.right)}`,
        );
      }
    }
    return {
      overflow: root.scrollWidth - width,
      bodyFontSize: getComputedStyle(document.body).fontSize,
      offenders: offenders.slice(0, 8),
    };
  });
}

async function expectFits(page: Page, path: string, bodyFontSize: string) {
  const layout = await measure(page);
  // Soft, so one run lists every page that breaks at this width.
  expect
    .soft(
      { path, overflow: layout.overflow, offenders: layout.offenders },
      `${path} scrolls sideways`,
    )
    .toEqual({ path, overflow: 0, offenders: [] });
  expect.soft(layout.bodyFontSize, `${path} body size`).toBe(bodyFontSize);
}

test.describe('DS 07 responsive widths', () => {
  test('customer pages never scroll sideways', async ({ page }) => {
    test.setTimeout(240_000);
    const packageSlug = (
      await prisma.package.findFirst({
        where: { status: 'PUBLISHED' },
        orderBy: { createdAt: 'asc' },
        select: { slug: true },
      })
    )?.slug;
    const paths = [
      '/en',
      '/en/destinations',
      '/en/destinations/havana',
      '/en/packages',
      ...(packageSlug ? [`/en/packages/${packageSlug}`] : []),
      '/en/packages/compare',
      '/en/travel-info',
      '/en/blog',
      '/en/blog/power-outages-in-cuba',
      '/en/about',
      '/en/support',
      '/en/legal/privacy',
      '/en/login',
      '/join',
      '/en/no-such-page',
    ];
    for (const path of paths) {
      await page.goto(`${STOREFRONT_URL}${path}`);
      await expectFits(page, path, '16px');
    }
  });

  test('the traveler account and the builder never scroll sideways', async ({ page }) => {
    test.setTimeout(180_000);
    const reservation = await prisma.reservation.findFirst({
      where: { bookingCode: 'DEMO0001' },
      select: { id: true },
    });
    await signIn(page, 'traveler@example.test', {
      origin: STOREFRONT_URL,
      callbackPath: '/en/account',
    });
    const paths = [
      '/en/account',
      ...(reservation ? [`/en/account/reservations/${reservation.id}`] : []),
      '/en/custom',
    ];
    for (const path of paths) {
      await page.goto(`${STOREFRONT_URL}${path}`);
      await expectFits(page, path, '16px');
    }
  });

  test('desk pages never scroll sideways from tablet width', async ({ page }) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) < DESK_MIN_WIDTH,
      'DS 07: the desk is a laptop tool, checked from 768 up',
    );
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
    const paths = [
      '/dashboard',
      '/bookings',
      ...(reservation ? [`/bookings/${reservation.id}`] : []),
      '/bookings/proposals',
      '/disruptions',
      '/packages',
      ...(pkg ? [`/packages/${pkg.id}`] : []),
      '/customers',
      ...(customer ? [`/customers/${customer.id}`] : []),
      '/suppliers',
      ...(supplier ? [`/suppliers/${supplier.id}`] : []),
      '/payments',
      '/content/advisories',
      '/reports',
      '/settings',
    ];
    for (const path of paths) {
      await page.goto(path);
      await expectFits(page, path, '14px');
    }
  });
});

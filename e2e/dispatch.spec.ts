import { PrismaClient } from '@ota/db';
import { expect, test, type Page } from '@playwright/test';

import { createDispatchableReservation, deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();
const BOOKING_CODE = 'E2EDSP01';

test.describe('dispatch from the dashboard', () => {
  let serviceItemId = '';

  test.beforeEach(async ({ page }) => {
    const { serviceItem } = await createDispatchableReservation(prisma, BOOKING_CODE);
    serviceItemId = serviceItem.id;
    await signIn(page);
  });

  test.afterEach(async () => {
    await deleteReservationFixture(prisma, BOOKING_CODE);
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('starts a submitted booking from the desk tasks and re-dispatches a decline', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    const task = page
      .getByRole('listitem')
      .filter({ hasText: `Ready to dispatch · ${BOOKING_CODE}` });
    const matrix = page.getByRole('region', { name: 'Dispatch matrix' });
    const row = matrix.getByRole('row').filter({ hasText: BOOKING_CODE });

    // Client components: retry until hydration attaches the handlers.
    await expect(async () => {
      await task.getByRole('button', { name: 'Start dispatch' }).click();
      await expect(row.getByRole('link', { name: BOOKING_CODE })).toBeVisible({
        timeout: 3_000,
      });
    }).toPass({ timeout: 30_000 });

    await expect(row.getByText(/^Offered · /)).toBeVisible();
    await expect(row.getByText(/^Example Guide/)).toBeVisible();

    // The worker declines (written directly, as the worker app would): red.
    await prisma.serviceItem.update({
      where: { id: serviceItemId },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    await page.reload();
    await expect(row.getByText('Declined', { exact: true })).toBeVisible();

    const panel = page.getByRole('dialog', {
      name: new RegExp(`^Re-dispatch Guide · ${BOOKING_CODE}`),
    });
    await expect(async () => {
      await row.getByRole('button', { name: 'Re-dispatch' }).click();
      await expect(panel).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    // The only seeded guide was already offered this service.
    await expect(
      panel.getByText('No other qualified worker is free for this service right now.'),
    ).toBeVisible();
  });

  test.describe('calendar and reliability', () => {
    const HISTORY_CODE = 'E2EDSP02';
    let guideId = '';

    test.beforeEach(async () => {
      const guide = await prisma.supplierProfile.findFirstOrThrow({
        where: { user: { email: 'guide@example.test' } },
      });
      guideId = guide.id;
    });

    test.afterEach(async () => {
      await prisma.availability.deleteMany({
        where: { supplierId: guideId, date: new Date('2027-05-02T00:00:00Z') },
      });
      await deleteReservationFixture(prisma, HISTORY_CODE);
    });

    /** Start dispatch from the dashboard and return the booking's matrix row. */
    async function startFromDashboard(page: Page) {
      await page.goto('/dashboard');
      const task = page
        .getByRole('listitem')
        .filter({ hasText: `Ready to dispatch · ${BOOKING_CODE}` });
      await expect(async () => {
        await task.getByRole('button', { name: 'Start dispatch' }).click();
        await expect(task).toHaveCount(0, { timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
      return page
        .getByRole('region', { name: 'Dispatch matrix' })
        .getByRole('row')
        .filter({ hasText: BOOKING_CODE })
        .first();
    }

    test('skips a guide who blocked a day of the service', async ({ page }) => {
      // The service runs 1–5 May 2027; the guide blocks the 2nd.
      await prisma.availability.upsert({
        where: {
          supplierId_date: {
            supplierId: guideId,
            date: new Date('2027-05-02T00:00:00Z'),
          },
        },
        create: {
          supplierId: guideId,
          date: new Date('2027-05-02T00:00:00Z'),
          isAvailable: false,
        },
        update: { isAvailable: false },
      });

      const candidates = await page.request.get(
        `/api/ota/service-items/${serviceItemId}/candidates`,
      );
      expect(await candidates.json()).toEqual([]);

      await startFromDashboard(page);
      await expect
        .poll(
          async () =>
            (await prisma.serviceItem.findUniqueOrThrow({ where: { id: serviceItemId } }))
              .supplierId,
        )
        .toBeNull();
    });

    test('skips a guide below 85 % but lets the desk offer them by hand', async ({
      page,
    }) => {
      // Five answered offers on another booking: 3 accepted, 2 declined (60 %).
      const { serviceItem: history } = await createDispatchableReservation(
        prisma,
        HISTORY_CODE,
      );
      await prisma.dispatchOffer.createMany({
        data: [0, 1, 2, 3, 4].map((index) => ({
          serviceItemId: history.id,
          supplierId: guideId,
          status: index < 3 ? ('ACCEPTED' as const) : ('DECLINED' as const),
          offeredAt: new Date('2026-08-01T10:00:00Z'),
          deadline: new Date('2026-08-01T12:00:00Z'),
          respondedAt: new Date('2026-08-01T10:05:00Z'),
        })),
      });

      const row = await startFromDashboard(page);
      await expect
        .poll(
          async () =>
            (await prisma.serviceItem.findUniqueOrThrow({ where: { id: serviceItemId } }))
              .supplierId,
        )
        .toBeNull();

      await page.reload();
      const panel = page.getByRole('dialog', {
        name: new RegExp(`^Re-dispatch Guide · ${BOOKING_CODE}`),
      });
      await expect(async () => {
        await row.getByRole('button', { name: 'Re-dispatch' }).click();
        await expect(panel).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      await expect(panel.getByText('Below 85 % · manual only')).toBeVisible();
      await expect(panel.getByText('60 % acceptance')).toBeVisible();

      await panel.getByRole('button', { name: /^Offer/ }).click();
      await expect
        .poll(
          async () =>
            (await prisma.serviceItem.findUniqueOrThrow({ where: { id: serviceItemId } }))
              .supplierId,
        )
        .toBe(guideId);
    });
  });
});

import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const TRAVELER_EMAIL = 'traveler@example.test';
const BOOKING = 'E2EEVT01';
const EVENT_SLUG = 'havana-jazz-festival-2027';
const DESK_EVENT = 'E2E Concierge Festival';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

/**
 * Everything this spec owns: the desk's "E2E Concierge…" events, the
 * traveler's event requests (with the custom requests the BUILD path derived
 * and their audit rows) and the E2EEVT01 booking.
 */
async function cleanup() {
  const traveler = await prisma.user.findUnique({ where: { email: TRAVELER_EMAIL } });
  if (traveler) {
    const requests = await prisma.eventRequest.findMany({
      where: { userId: traveler.id },
      select: { id: true, path: true, customRequestId: true },
    });
    const derived = requests
      .filter((request) => request.path !== 'EXISTING' && request.customRequestId)
      .map((request) => request.customRequestId!);
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [...requests.map((request) => request.id), ...derived] } },
    });
    await prisma.eventRequest.deleteMany({ where: { userId: traveler.id } });
    await prisma.customRequest.deleteMany({ where: { id: { in: derived } } });
  }
  const deskEvents = await prisma.event.findMany({
    where: { name: { startsWith: 'E2E Concierge' } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: deskEvents.map((event) => event.id) } },
  });
  await prisma.event.deleteMany({
    where: { id: { in: deskEvents.map((event) => event.id) } },
  });
  const booking = await prisma.reservation.findUnique({
    where: { bookingCode: BOOKING },
  });
  if (booking) {
    await prisma.auditLog.deleteMany({ where: { entityId: booking.id } });
    await prisma.reservation.delete({ where: { id: booking.id } });
  }
}

test.describe('M10 events and the ticket concierge', () => {
  test.beforeAll(async () => {
    await cleanup();
    const traveler = await prisma.user.findUniqueOrThrow({
      where: { email: TRAVELER_EMAIL },
    });
    // A confirmed festival-week trip whose price is locked, its balance due.
    await prisma.reservation.create({
      data: {
        userId: traveler.id,
        bookingCode: BOOKING,
        startDate: new Date('2027-01-16T00:00:00Z'),
        endDate: new Date('2027-01-26T00:00:00Z'),
        status: 'CONFIRMED',
        totalAmount: 2000,
        partySize: 2,
        instalments: {
          create: [
            {
              kind: 'DEPOSIT',
              position: 0,
              amount: 600,
              dueAt: new Date('2026-10-01T00:00:00Z'),
              status: 'PAID',
            },
            {
              kind: 'BALANCE',
              position: 1,
              amount: 1400,
              dueAt: new Date('2026-12-20T00:00:00Z'),
            },
          ],
        },
      },
    });
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('the desk drafts an event with a night and a category, then publishes it', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/content/events/new');
    await expect(async () => {
      await page.getByRole('button', { name: 'Add a night' }).click();
      await expect(page.getByLabel('Programme')).toHaveCount(1, { timeout: 2_000 });
    }).toPass();
    await page.getByLabel('Name', { exact: true }).first().fill(DESK_EVENT);
    await page.getByLabel('Place').fill('Teatro Martí');
    await page.getByLabel('Summary').fill('One night of danzón at the Martí.');
    await page.getByLabel('First day').fill('2027-03-12');
    await page.getByLabel('Last day').fill('2027-03-12');
    await page.getByLabel('Date', { exact: true }).fill('2027-03-12');
    await page.getByLabel('Programme').fill('Danzón night');
    await page.getByRole('button', { name: 'Add a category' }).click();
    await page
      .getByRole('group', { name: 'Category 1' })
      .getByLabel('Name', { exact: true })
      .fill('General admission');
    await page.getByLabel('Price per seat (EUR)').fill('20');
    await page.getByRole('button', { name: 'Create draft' }).click();

    await expect(page.getByRole('heading', { level: 1, name: DESK_EVENT })).toBeVisible();
    await expect(page.getByText('Ready to publish.')).toBeVisible();
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(
      page.getByText(/Live at \/events\/e2e-concierge-festival/),
    ).toBeVisible();

    await page.goto('/content/events');
    await expect(page.getByRole('link', { name: DESK_EVENT })).toBeVisible();
  });

  test('a traveler requests seats, and the desk confirms them onto a locked booking', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const eventUrl = `${STOREFRONT_URL}/en/events/${EVENT_SLUG}`;
    await signIn(page, TRAVELER_EMAIL, {
      origin: STOREFRONT_URL,
      callbackPath: `/en/events/${EVENT_SLUG}`,
    });

    // A trip to build around the festival: it derives a custom request.
    await expect(async () => {
      await page.getByRole('checkbox', { name: /Opening gala/ }).click();
      await expect(page.getByText('Festival nights · 1 of 7 selected')).toBeVisible({
        timeout: 2_000,
      });
    }).toPass();
    await page.getByRole('radio', { name: /^Numbered seat/ }).check();
    await page.getByRole('button', { name: 'Continue to your trip' }).click();
    await expect(page.getByLabel('Arrival in Cuba')).toHaveValue('2027-01-16');
    await page.getByRole('button', { name: 'Continue to contact' }).click();
    await page.getByRole('button', { name: 'Send request' }).click();
    const built = page.getByRole('status').getByRole('heading');
    await expect(built).toHaveText(
      /^Request VX-E-[A-Z0-9]{8} received · nothing is charged$/,
    );
    await expect(page.getByText(/Your trip request is VX-C-/)).toBeVisible();

    // Keep building the derived trip: one adult cannot carry two seats.
    await page.getByRole('link', { name: 'Keep building the trip' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Keep building the trip' }),
    ).toBeVisible();
    await expect(page.getByLabel('Arrival in Cuba')).toHaveValue('2027-01-16');
    await expect(async () => {
      await page.getByRole('button', { name: 'Remove one adult' }).click();
      await expect(page.getByRole('button', { name: 'Remove one adult' })).toBeDisabled({
        timeout: 2_000,
      });
    }).toPass();
    for (let step = 1; step < 5; step += 1) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }
    await page.getByRole('button', { name: 'Save my changes' }).click();
    await expect(
      page.getByText('These changes would leave out your event seats:'),
    ).toBeVisible();
    await expect(
      page.getByText(
        /^The party must have at least as many people as the seats for .+ \(VX-E-[A-Z0-9]{8}\)\.$/,
      ),
    ).toBeVisible();

    // Seats for a trip the traveler already has.
    await page.goto(eventUrl);
    await expect(async () => {
      await page.getByRole('checkbox', { name: /Late set/ }).click();
      await expect(page.getByText('Festival nights · 1 of 7 selected')).toBeVisible({
        timeout: 2_000,
      });
    }).toPass();
    await page.getByRole('radio', { name: /^Numbered seat/ }).check();
    await page.getByRole('button', { name: 'Continue to your trip' }).click();
    await page.getByRole('radio', { name: /^Attach to a trip I already have/ }).check();
    await page.getByLabel('Your trip').selectOption({ label: `Booking ${BOOKING}` });
    await page.getByRole('button', { name: 'Continue to contact' }).click();
    await page.getByRole('button', { name: 'Send request' }).click();
    const heading = await page.getByRole('status').getByRole('heading').textContent();
    const reference = heading!.match(/VX-E-[A-Z0-9]{8}/)![0];

    // The desk answers, then confirms at the indicative €45 a seat.
    await signIn(page);
    await page.goto('/bookings/event-requests');
    await page.getByRole('link', { name: reference }).click();
    await expect(page.getByText(`${BOOKING}`, { exact: true })).toBeVisible();
    await expect(async () => {
      await page.getByRole('button', { name: 'We can request these seats' }).click();
      await expect(page.getByText('Requesting', { exact: true })).toBeVisible({
        timeout: 3_000,
      });
    }).toPass();
    await page.getByRole('button', { name: 'Confirm seats' }).click();
    await expect(page.getByLabel('Price paid per ticket (EUR)')).toHaveValue('45');
    // 2 seats × 1 night: €90 of tickets and €30 of fees.
    await expect(
      page.getByText(
        '2 tickets: €90.00 + concierge fee €30.00 = €120.00 added to the booking.',
      ),
    ).toBeVisible();
    await expect(page.getByText(/price is locked/)).toBeVisible();
    await page.getByRole('button', { name: 'Confirm seats' }).click();
    await expect(page.getByText('Confirmed', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('€120.00')).toBeVisible();

    const booking = await prisma.reservation.findUniqueOrThrow({
      where: { bookingCode: BOOKING },
      include: { instalments: true },
    });
    expect(Number(booking.totalAmount)).toBe(2120);
    expect(
      booking.instalments.find((row) => row.kind === 'TICKETS')?.amount.toString(),
    ).toBe('120');
    await page.goto(`/bookings/${booking.id}`);
    await expect(page.getByRole('heading', { name: 'Event requests' })).toBeVisible();
    await expect(page.getByRole('link', { name: reference })).toBeVisible();

    // The traveler sees what the seats added.
    await signIn(page, TRAVELER_EMAIL, {
      origin: STOREFRONT_URL,
      callbackPath: '/en/account',
    });
    await page.goto(`${STOREFRONT_URL}/en/account?tab=trips`);
    const mine = page.getByRole('region', { name: 'Event requests' });
    await expect(mine.getByText('€120 added to your booking.')).toBeVisible();
    await expect(mine.getByText('Received')).toBeVisible();

    // Withdrawing asks first (DS 02); keeping the request leaves it as it was.
    const confirm = page.getByRole('dialog', { name: 'Withdraw this request?' });
    await expect(async () => {
      await mine.getByRole('button', { name: 'Withdraw' }).click();
      await expect(confirm).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await expect(confirm).toContainText('cannot be reopened');
    await confirm.getByRole('button', { name: 'Keep the request' }).click();
    await expect(confirm).toBeHidden();
    await expect(mine.getByText('Received')).toBeVisible();
  });
});

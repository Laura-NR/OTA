import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const TRAVELER_EMAIL = 'traveler@example.test';
const BOOKING = 'E2EEVT01';
const EVENT_SLUG = 'havana-jazz-festival-2027';
const DESK_EVENT = 'E2E Concierge Festival';
const HOLD_EVENT = 'E2E Concierge Hold Fest';
const HOLD_CASA = 'E2E Concierge Casa';
// A valid 1x1 PNG.
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

/**
 * Everything this spec owns: the desk's "E2E Concierge…" events (with their
 * photos) and the "E2E Concierge…" casa they hold, the traveler's event
 * requests (with the custom requests the BUILD path derived and their audit
 * rows) and the E2EEVT01 booking.
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
  await prisma.inventoryItem.deleteMany({
    where: { name: { startsWith: 'E2E Concierge' } },
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

  test('the desk holds a room at a casa and adds photos; the page shows both and opens the builder on its dates', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await prisma.inventoryItem.create({
      data: {
        type: 'ACCOMMODATION',
        name: HOLD_CASA,
        province: 'La Habana',
        basePrice: 55,
      },
    });
    // The hold ends in two days in Havana, so the dashboard reminds the desk.
    const havanaToday = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Havana',
    }).format(new Date());
    const holdUntil = new Date(Date.parse(`${havanaToday}T00:00:00Z`) + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    await signIn(page);
    const created = await page.request.post('/api/ota/events', {
      data: {
        access: 'GUIDE_ONLY',
        province: 'CU03',
        startsOn: '2027-04-10',
        endsOn: '2027-04-12',
        datesConfirmed: true,
        sourceLocale: 'en',
        name: HOLD_EVENT,
        place: 'Malecón',
        summary: 'Free concerts on the seafront.',
      },
    });
    expect(created.ok()).toBe(true);
    const { id, slug } = (await created.json()) as { id: string; slug: string };

    // H1a: the casa, the last day and the note.
    await page.goto(`/content/events/${id}`);
    await expect(async () => {
      await page.getByLabel('Casa', { exact: true }).selectOption({ label: HOLD_CASA });
      await expect(page.getByLabel('Casa', { exact: true })).not.toHaveValue('', {
        timeout: 2_000,
      });
    }).toPass();
    await page.getByLabel('Held until').fill(holdUntil);
    await page.getByLabel('Note', { exact: true }).fill('balcony rooms');
    await page.getByRole('button', { name: 'Save event' }).click();
    await expect(page.getByLabel('Held until')).toHaveValue(holdUntil);

    // P1a: two photos; the second is made the hero.
    for (const alt of ['The stage at dusk', 'Dancers by the sea wall']) {
      await page.getByLabel('Photo', { exact: true }).setInputFiles({
        name: 'photo.png',
        mimeType: 'image/png',
        buffer: Buffer.from(PNG_1X1, 'base64'),
      });
      await page.getByLabel('Alt text', { exact: true }).fill(alt);
      await page.getByRole('button', { name: 'Upload photo' }).click();
      await expect(page.getByAltText(alt)).toBeVisible();
    }
    await page
      .getByRole('listitem')
      .filter({ has: page.getByAltText('Dancers by the sea wall') })
      .getByRole('button', { name: 'Make hero' })
      .click();
    await expect(
      page
        .getByRole('listitem')
        .filter({ has: page.getByAltText('Dancers by the sea wall') })
        .getByText('Hero', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText(new RegExp(`Live at /events/${slug}`))).toBeVisible();

    // H2a: the dashboard task while the hold ends within three days.
    await page.goto('/dashboard');
    await expect(
      page.getByText(new RegExp(`^Room hold at ${HOLD_CASA} ends`)),
    ).toBeVisible();
    await expect(page.getByText(`For ${HOLD_EVENT}.`, { exact: false })).toBeVisible();

    // The storefront: the hero, the hold line, and the builder link with the dates.
    await page.goto(`${STOREFRONT_URL}/en/events/${slug}`);
    await expect(page.getByAltText('Dancers by the sea wall').first()).toBeVisible();
    const hold = page.getByRole('complementary', { name: 'Room held for festival week' });
    await expect(hold).toContainText(`We hold a room at ${HOLD_CASA} (balcony rooms)`);
    const build = hold.getByRole('link', { name: 'Build the trip with these dates' });
    await expect(build).toHaveAttribute(
      'href',
      '/en/custom?from=2027-04-10&to=2027-04-13&province=CU03',
    );
    // The list is cached for 60 s (`getEvents`), so an earlier spec's visit can
    // serve it from before this event existed.
    await expect(async () => {
      await page.goto(`${STOREFRONT_URL}/en/events`);
      await expect(page.getByAltText('Dancers by the sea wall')).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 90_000, intervals: [5_000] });

    // H3a: signed in, the builder starts on those dates with Havana placed.
    await signIn(page, TRAVELER_EMAIL, {
      origin: STOREFRONT_URL,
      callbackPath: '/en/custom?from=2027-04-10&to=2027-04-13&province=CU03',
    });
    await expect(page.getByLabel('Arrival in Cuba')).toHaveValue('2027-04-10');
    await expect(page.getByText('Your route · 3 of 3 nights placed')).toBeVisible();
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

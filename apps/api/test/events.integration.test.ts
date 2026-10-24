import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { parseTenantConfig } from '@ota/config';
import { PrismaClient } from '@ota/db';
import type { EmailMessage, Mailer } from '@ota/email';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import type { DocumentsService } from '../src/documents/documents.service';
import { EventRequestsService } from '../src/events/event-requests.service';
import { EventsService } from '../src/events/events.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { fakeOperatingSettings } from './fixtures/operating-settings';

// Prisma Client auto-loads packages/db/.env, so require an explicit opt-in.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

const tenant = parseTenantConfig({
  tenantId: 'test-agency',
  branding: { agencyName: 'Test Agency', licenseNumber: 'MINTUR-TEST-1234' },
  supportedLocales: ['en', 'es'],
  primaryLocale: 'en',
  concierge: { feePerSeat: 15, maxSeats: 8, ticketPaymentDays: 7 },
});

const DAY = 86_400_000;

function utcDay(offsetDays: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays),
  );
}

/**
 * Live proof of M10 against Postgres: the desk publishes an event; a traveler
 * requests seats on a trip to build, which derives an M5 custom request; the
 * desk confirms seats onto a price-locked booking, which adds the ticket and
 * fee lines, raises the total and appends a TICKETS instalment; an unavailable
 * request charges nothing. Run with `RUN_DB_INTEGRATION=1 pnpm --filter
 * @ota/api exec vitest run test/events.integration.test.ts`.
 */
describe.skipIf(!runIntegration)(
  'events and the ticket concierge (live Postgres)',
  () => {
    let prisma: PrismaClient;
    let events: EventsService;
    let requests: EventRequestsService;
    let ops: AuthUser;
    let traveler: AuthUser;
    let eventId = '';
    let slug = '';
    let generalId = '';
    let nightIds: string[] = [];
    let bookingId = '';
    const stamp = Date.now();
    const sent: EmailMessage[] = [];
    const mailer: Mailer = { send: async (message) => void sent.push(message) };
    const regenerated: string[] = [];

    beforeAll(async () => {
      prisma = new PrismaClient();
      const documents = {
        generate: async (reservationId: string) => {
          regenerated.push(reservationId);
          return [];
        },
      } as unknown as DocumentsService;
      events = new EventsService(prisma as unknown as PrismaService, tenant);
      requests = new EventRequestsService(
        prisma as unknown as PrismaService,
        mailer,
        tenant,
        fakeOperatingSettings(),
        documents,
      );
      const make = async (role: AuthUser['role'], email: string) => {
        const user = await prisma.user.create({
          data: { email, fullName: email.split('@')[0], role, locale: 'en' },
        });
        return { id: user.id, email: user.email, role } as AuthUser;
      };
      ops = await make(
        'OPERATIONS_ADMIN' as AuthUser['role'],
        `ev-ops-${stamp}@example.test`,
      );
      traveler = await make(
        'TRAVELER' as AuthUser['role'],
        `ev-trav-${stamp}@example.test`,
      );

      // A booking whose price is locked, with its balance still due in 20 days.
      const booking = await prisma.reservation.create({
        data: {
          userId: traveler.id,
          bookingCode: `EV${String(stamp).slice(-6)}`,
          startDate: utcDay(58),
          endDate: utcDay(68),
          status: 'CONFIRMED',
          totalAmount: 2000,
          partySize: 2,
          instalments: {
            create: [
              {
                kind: 'DEPOSIT',
                position: 0,
                amount: 600,
                dueAt: utcDay(-5),
                status: 'PAID',
              },
              { kind: 'BALANCE', position: 1, amount: 1400, dueAt: utcDay(20) },
            ],
          },
        },
      });
      bookingId = booking.id;
    });

    afterAll(async () => {
      if (!prisma) return;
      const requestRows = traveler
        ? await prisma.eventRequest.findMany({
            where: { userId: traveler.id },
            select: { id: true },
          })
        : [];
      // Every id is listed explicitly: an undefined filter would match every row.
      const actorIds = [ops?.id, traveler?.id].filter((id): id is string => Boolean(id));
      const entityIds = [
        ...requestRows.map((row) => row.id),
        ...(eventId ? [eventId] : []),
      ];
      await prisma.auditLog.deleteMany({
        where: {
          OR: [{ entityId: { in: entityIds } }, { actorUserId: { in: actorIds } }],
        },
      });
      await prisma.eventRequest.deleteMany({ where: { userId: { in: actorIds } } });
      await prisma.customRequest.deleteMany({ where: { userId: { in: actorIds } } });
      await prisma.reservation.deleteMany({ where: { userId: { in: actorIds } } });
      if (eventId) await prisma.event.delete({ where: { id: eventId } });
      await prisma.user.deleteMany({ where: { id: { in: actorIds } } });
      await prisma.$disconnect();
    });

    it('publishes an event and serves it in a published overlay', async () => {
      const created = await events.create(ops, {
        access: 'ALLOCATIONS_OPEN',
        province: 'CU03',
        startsOn: utcDay(60),
        endsOn: utcDay(66),
        datesConfirmed: true,
        confirmBy: utcDay(50),
        sourceLocale: 'en',
        name: `IT Jazz Festival ${stamp}`,
        place: 'Vedado',
        summary: 'Seven nights of concerts.',
        notes: null,
        nights: [
          { date: utcDay(60), label: 'Opening gala', venue: 'Teatro Nacional' },
          { date: utcDay(61), label: 'Late set', venue: null },
          { date: utcDay(65), label: 'Headline night', venue: null },
        ],
        categories: [
          {
            kind: 'NUMBERED',
            name: 'Numbered seat',
            description: null,
            pricePerSeat: 40,
          },
          {
            kind: 'PASS',
            name: 'All-festival pass',
            description: null,
            pricePerSeat: null,
          },
        ],
      });
      eventId = created.id;
      slug = created.slug;
      generalId = created.categories[0]!.id;
      nightIds = created.nights.map((night) => night.id);
      expect(created.status).toBe('DRAFT');
      expect(created.publishIssues).toEqual([]);

      await events.putTranslation(ops, eventId, 'es', {
        name: 'Festival de Jazz IT',
        nights: { [nightIds[0]!]: { label: 'Gala inaugural' } },
        categories: {},
        published: true,
      });
      await events.publish(ops, eventId);

      const listed = await events.listPublic('es');
      const mine = listed.find((event) => event.slug === slug)!;
      expect(mine.name).toBe('Festival de Jazz IT');
      expect(mine.locale).toBe('es');
      expect(mine.nights[0]!.label).toBe('Gala inaugural');
      expect(mine.place).toBe('Vedado');
    });

    it('takes a trip to build and derives its M5 custom request', async () => {
      const result = await requests.create(traveler, {
        eventSlug: slug,
        categoryId: generalId,
        nightIds: [nightIds[0]!, nightIds[1]!],
        seats: 2,
        path: 'BUILD',
        arrival: utcDay(58),
        totalNights: 10,
        afterProvince: 'CU01',
        locale: 'es',
      });
      expect(result.reference).toMatch(/^VX-E-/);
      expect(result.customRequestReference).toMatch(/^VX-C-/);

      const custom = await prisma.customRequest.findUniqueOrThrow({
        where: { reference: result.customRequestReference! },
        include: { proposals: true },
      });
      const payload = custom.payload as { adults: number; route: unknown[] };
      expect(payload.adults).toBe(2);
      // Arrival day 58, last chosen night day 61: four nights in La Habana, then six.
      expect(payload.route).toEqual([
        { province: 'CU03', nights: 4 },
        { province: 'CU01', nights: 6 },
      ]);
      expect(custom.proposals).toHaveLength(1);
      expect(sent.at(-1)!.subject).toContain('Festival de Jazz IT');

      await expect(
        events.update(ops, eventId, {
          access: 'ALLOCATIONS_OPEN',
          province: 'CU03',
          startsOn: utcDay(60),
          endsOn: utcDay(66),
          datesConfirmed: true,
          confirmBy: utcDay(50),
          sourceLocale: 'en',
          name: `IT Jazz Festival ${stamp}`,
          place: 'Vedado',
          summary: 'Seven nights of concerts.',
          notes: null,
          nights: [
            { id: nightIds[2], date: utcDay(65), label: 'Headline night', venue: null },
          ],
          categories: [
            {
              id: generalId,
              kind: 'NUMBERED',
              name: 'Numbered seat',
              description: null,
              pricePerSeat: 40,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("refuses another event's category and a booking the traveler cannot use", async () => {
      await expect(
        requests.create(traveler, {
          eventSlug: slug,
          categoryId: '00000000-0000-4000-8000-000000000000',
          nightIds: [nightIds[0]!],
          seats: 2,
          path: 'TICKETS_ONLY',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(
        requests.create(ops, {
          eventSlug: slug,
          categoryId: generalId,
          nightIds: [nightIds[0]!],
          seats: 1,
          path: 'EXISTING',
          reservationId: bookingId,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('confirms seats onto a locked booking: lines, total and a TICKETS instalment', async () => {
      const result = await requests.create(traveler, {
        eventSlug: slug,
        categoryId: generalId,
        nightIds: [nightIds[0]!, nightIds[2]!],
        seats: 3,
        path: 'EXISTING',
        reservationId: bookingId,
      });

      await expect(
        requests.confirm(ops, result.id, { pricePerSeat: 50 }),
      ).rejects.toBeInstanceOf(ConflictException);
      await requests.markRequesting(ops, result.id);
      const confirmed = await requests.confirm(ops, result.id, { pricePerSeat: 50 });

      // 3 seats × 2 nights = 6 tickets: 300 of seats and 90 of fees.
      expect(confirmed).toMatchObject({
        status: 'CONFIRMED',
        tickets: 6,
        pricePerSeat: 50,
        feePerSeat: 15,
        total: 390,
        bookingCode: expect.any(String),
      });
      const booking = await prisma.reservation.findUniqueOrThrow({
        where: { id: bookingId },
        include: {
          priceLines: { where: { kind: { in: ['EVENT_TICKET', 'CONCIERGE_FEE'] } } },
          instalments: { orderBy: { position: 'asc' } },
        },
      });
      expect(Number(booking.totalAmount)).toBe(2390);
      expect(
        booking.priceLines.map((line) => [line.kind, Number(line.amount)]).sort(),
      ).toEqual([
        ['CONCIERGE_FEE', 90],
        ['EVENT_TICKET', 300],
      ]);
      const tickets = booking.instalments.find((row) => row.kind === 'TICKETS')!;
      expect(Number(tickets.amount)).toBe(390);
      expect(tickets.position).toBe(2);
      // Seven days from now come before the balance's day 20.
      expect(Math.round((tickets.dueAt.getTime() - Date.now()) / DAY)).toBe(7);
      expect(regenerated).toContain(bookingId);
      expect(sent.at(-1)!.text).toContain('€390.00');
    });

    it('marks a request unavailable with nothing charged, and lets the traveler withdraw one', async () => {
      const before = await prisma.reservation.findUniqueOrThrow({
        where: { id: bookingId },
      });
      const unavailable = await requests.create(traveler, {
        eventSlug: slug,
        categoryId: generalId,
        nightIds: [nightIds[1]!],
        seats: 1,
        path: 'EXISTING',
        reservationId: bookingId,
      });
      const closed = await requests.markUnavailable(
        ops,
        unavailable.id,
        'The set sold out.',
      );
      expect(closed).toMatchObject({
        status: 'UNAVAILABLE',
        closedReason: 'The set sold out.',
      });
      const after = await prisma.reservation.findUniqueOrThrow({
        where: { id: bookingId },
      });
      expect(Number(after.totalAmount)).toBe(Number(before.totalAmount));

      const withdrawn = await requests.create(traveler, {
        eventSlug: slug,
        categoryId: generalId,
        nightIds: [nightIds[1]!],
        seats: 1,
        path: 'TICKETS_ONLY',
      });
      const mine = await requests.cancelMine(traveler, withdrawn.id);
      expect(mine.status).toBe('CANCELLED');
      await expect(requests.cancelMine(traveler, withdrawn.id)).rejects.toBeInstanceOf(
        ConflictException,
      );

      const listed = await requests.listMine(traveler);
      expect(listed.map((row) => row.status).sort()).toEqual([
        'CANCELLED',
        'CONFIRMED',
        'SUBMITTED',
        'UNAVAILABLE',
      ]);
    });

    it('refuses to delete an event that requests point at', async () => {
      await expect(events.remove(ops, eventId)).rejects.toBeInstanceOf(ConflictException);
    });
  },
);

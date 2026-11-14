import { PrismaClient } from '@ota/db';
import { zonedCalendarDay } from '@ota/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OpsLiteService } from '../src/ops-lite/ops-lite.service';
import type { PrismaService } from '../src/prisma/prisma.service';

// Prisma Client auto-loads packages/db/.env, so DATABASE_URL is present; require
// an explicit opt-in so the default unit suite stays database-free.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

const MINUTE = 60_000;
const DAY_MS = 24 * 60 * MINUTE;

/**
 * Live proof of Ops Lite's reads against Postgres: the state counts, the
 * overdue booking leading its state, where a trip under way is today and the
 * open case there, today's movements, and the inbox's urgent and unread
 * threads with their counts. Other rows in the dev database may share the
 * lists, so the assertions look at this test's own bookings. Run with
 * `RUN_DB_INTEGRATION=1 pnpm --filter @ota/api exec vitest run
 * test/ops-lite.integration.test.ts` against a migrated dev database.
 */
describe.skipIf(!runIntegration)('OpsLiteService (live Postgres)', () => {
  let prisma: PrismaClient;
  let service: OpsLiteService;
  const suffix = String(Date.now()).slice(-5);
  const email = `ops-lite-${suffix}@example.test`;
  const codes = {
    running: `OLA${suffix}`,
    overdue: `OLB${suffix}`,
    onTime: `OLC${suffix}`,
    arriving: `OLD${suffix}`,
    paying: `OLE${suffix}`,
  };
  const ids: Record<keyof typeof codes, string> = {
    running: '',
    overdue: '',
    onTime: '',
    arriving: '',
    paying: '',
  };
  let caseId = '';

  beforeAll(async () => {
    prisma = new PrismaClient();
    service = new OpsLiteService(prisma as unknown as PrismaService);
    const now = Date.now();
    const today = zonedCalendarDay(new Date());

    const traveler = await prisma.user.create({
      data: {
        email,
        role: 'TRAVELER',
        fullName: 'Lite Traveler',
        phone: '+34 600 555 019',
      },
    });
    const booking = async (
      key: keyof typeof codes,
      status: string,
      extra: Record<string, unknown> = {},
    ) => {
      const row = await prisma.reservation.create({
        data: {
          userId: traveler.id,
          bookingCode: codes[key],
          status: status as never,
          startDate: new Date(today.getTime() + 10 * DAY_MS),
          endDate: new Date(today.getTime() + 14 * DAY_MS),
          ...extra,
        },
      });
      ids[key] = row.id;
      return row;
    };

    await booking('running', 'IN_PROGRESS', {
      partySize: 3,
      startDate: new Date(today.getTime() - 2 * DAY_MS),
      endDate: new Date(today.getTime() + 3 * DAY_MS),
      serviceItems: {
        create: {
          serviceType: 'ACCOMMODATION',
          province: 'Pinar del Río',
          status: 'ACCEPTED',
          serviceDateStart: new Date(now - DAY_MS),
          serviceDateEnd: new Date(now + 2 * DAY_MS),
        },
      },
      messages: { create: { sender: 'TRAVELER', body: 'Is the generator on tonight?' } },
    });
    const offered = (deadline: number) => ({
      serviceItems: {
        create: {
          serviceType: 'GUIDE',
          status: 'OFFERED',
          serviceDateStart: new Date(now + 10 * DAY_MS),
          serviceDateEnd: new Date(now + 11 * DAY_MS),
          offeredAt: new Date(deadline - 120 * MINUTE),
          dispatchDeadline: new Date(deadline),
        },
      },
    });
    await booking('onTime', 'ASSEMBLY_AND_ESCALATION', {
      ...offered(now + 30 * MINUTE),
      messages: { create: { sender: 'TRAVELER', body: 'Any news on the guide?' } },
    });
    // A year overdue, so it leads its state whatever else the dev database holds.
    await booking('overdue', 'ASSEMBLY_AND_ESCALATION', offered(now - 365 * DAY_MS));
    await booking('arriving', 'CONFIRMED', {
      startDate: today,
      messages: {
        create: [
          {
            sender: 'TRAVELER',
            body: 'We land at 16:35.',
            readAt: new Date(now - 5 * MINUTE),
            createdAt: new Date(now - 10 * MINUTE),
          },
          {
            sender: 'OPERATIONS',
            body: 'Reinier meets you at T3.',
            createdAt: new Date(now - 5 * MINUTE),
          },
        ],
      },
    });
    await booking('paying', 'PENDING_PAYMENT', {
      instalments: {
        create: {
          kind: 'DEPOSIT',
          position: 1,
          amount: '300.00',
          // An hour from now, within today in Havana unless the test runs at 23:00.
          dueAt: new Date(
            Math.min(now + 60 * MINUTE, today.getTime() + DAY_MS + 4 * 60 * MINUTE),
          ),
        },
      },
    });

    const openCase = await prisma.disruptionCase.create({
      data: {
        reference: `DC-L${suffix}`,
        scenario: 'outage',
        severity: 'MAJOR',
        province: 'CU01',
        title: 'Pinar del Río outage',
        summary: 'Rolling blackouts.',
        policy: 'Relocate on request.',
        bookings: { create: { reservationId: ids.running } },
      },
    });
    caseId = openCase.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (caseId) await prisma.disruptionCase.delete({ where: { id: caseId } });
    await prisma.reservation.deleteMany({
      where: { bookingCode: { in: Object.values(codes) } },
    });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('counts the states, leads assembly with the overdue booking and places the trip', async () => {
    const pipeline = await service.pipeline();
    const state = (status: string) =>
      pipeline.states.find((entry) => entry.status === status)!;

    expect(pipeline.states.map((entry) => entry.status)).toHaveLength(10);
    expect(state('ASSEMBLY_AND_ESCALATION').count).toBeGreaterThanOrEqual(2);
    expect(pipeline.inPipeline).toBeGreaterThanOrEqual(3);
    const lead = state('ASSEMBLY_AND_ESCALATION').rows[0]!;
    expect(lead.bookingCode).toBe(codes.overdue);
    expect(lead.clock).toEqual({ kind: 'expired', tone: 'error' });

    const pinar = pipeline.ground.provinces.find(
      (entry) => entry.province === 'Pinar del Río',
    );
    expect(pinar?.travelers).toBeGreaterThanOrEqual(3);
    expect(pinar?.scenario).toBe('outage');
    expect(pipeline.ground.cases.map((entry) => entry.id)).toContain(caseId);

    const mine = pipeline.movements.filter((movement) =>
      [codes.arriving, codes.paying].includes(movement.bookingCode),
    );
    expect(mine.map((movement) => [movement.bookingCode, movement.kind])).toEqual([
      [codes.paying, 'PAYMENT_DUE'],
      [codes.arriving, 'ARRIVAL'],
    ]);
  });

  it('lists the urgent thread first, then the unread one, then the answered one', async () => {
    const inbox = await service.inbox();
    const mine = inbox.threads.filter((thread) =>
      [codes.running, codes.onTime, codes.arriving].includes(thread.bookingCode),
    );

    expect(mine.map((thread) => thread.bookingCode)).toEqual([
      codes.running,
      codes.onTime,
      codes.arriving,
    ]);
    expect(mine[0]).toMatchObject({
      urgent: true,
      unread: 1,
      awaitingReply: true,
      disruption: { id: caseId },
      travelerPhone: '+34 600 555 019',
      partySize: 3,
      provinces: ['Pinar del Río'],
    });
    expect(mine[1]).toMatchObject({ urgent: false, unread: 1, disruption: null });
    expect(mine[2]).toMatchObject({
      urgent: false,
      unread: 0,
      awaitingReply: false,
      lastMessage: { sender: 'OPERATIONS', body: 'Reinier meets you at T3.' },
    });
    expect(inbox.counts.urgent).toBeGreaterThanOrEqual(1);
    expect(inbox.counts.unread).toBeGreaterThanOrEqual(2);
  });
});

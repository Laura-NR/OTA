import { ConflictException } from '@nestjs/common';
import { parseTenantConfig } from '@ota/config';
import { PrismaClient } from '@ota/db';
import type { EmailMessage, Mailer } from '@ota/email';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdvisoriesService } from '../src/advisories/advisories.service';
import type { AuthUser } from '../src/common/auth/auth-user';
import { DisruptionsService } from '../src/disruptions/disruptions.service';
import type { PrismaService } from '../src/prisma/prisma.service';

// Prisma Client auto-loads packages/db/.env, so require an explicit opt-in.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

const tenant = parseTenantConfig({
  tenantId: 'test-agency',
  branding: { agencyName: 'Test Agency', licenseNumber: 'MINTUR-TEST-1234' },
  disruptions: {
    scenarios: [
      {
        key: 'outage',
        label: 'Power outage > 12 h',
        trigger: 'Outage > 6 h',
        steps: [{ text: 'Confirm safety', owner: 'Reservations', due: 'within 30 min' }],
        options: [
          { key: 'A', title: 'Stay', detail: 'No change to price' },
          { key: 'B', title: 'Move', detail: 'Same price' },
        ],
        policy: 'Meal vouchers for outages over 12 h.',
      },
    ],
  },
});

const HOUR = 3_600_000;

function utcDay(offsetDays: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays),
  );
}

/**
 * Live proof of M8 against Postgres: a case suggests the secured trip under
 * way in its province, copies its playbook, emails E-Options once per offer,
 * takes one traveler answer when two arrive at once, and drafts its banner as
 * a linked M7 advisory. Run with `RUN_DB_INTEGRATION=1 pnpm --filter @ota/api
 * exec vitest run test/disruptions.integration.test.ts` against a migrated dev
 * database.
 */
describe.skipIf(!runIntegration)('disruptions (live Postgres)', () => {
  let prisma: PrismaClient;
  let service: DisruptionsService;
  let ops: AuthUser;
  let traveler: AuthUser;
  let reservationId = '';
  let caseId = '';
  const stamp = Date.now();
  const sent: EmailMessage[] = [];
  const travelerEmail = `disruption-it-${stamp}@example.test`;
  const mailer: Mailer = { send: async (message) => void sent.push(message) };

  beforeAll(async () => {
    prisma = new PrismaClient();
    const advisories = new AdvisoriesService(
      prisma as unknown as PrismaService,
      mailer,
      tenant,
    );
    service = new DisruptionsService(
      prisma as unknown as PrismaService,
      advisories,
      mailer,
      tenant,
    );
    const make = async (role: AuthUser['role'], email: string) => {
      const user = await prisma.user.create({
        data: { email, fullName: email.split('@')[0], role, locale: 'en' },
      });
      return { id: user.id, email: user.email, role } as AuthUser;
    };
    ops = await make(
      'OPERATIONS_ADMIN' as AuthUser['role'],
      `dc-ops-${stamp}@example.test`,
    );
    traveler = await make('TRAVELER' as AuthUser['role'], travelerEmail);
    const reservation = await prisma.reservation.create({
      data: {
        userId: traveler.id,
        bookingCode: `DC${String(stamp).slice(-6)}`,
        startDate: utcDay(-1),
        endDate: utcDay(5),
        status: 'IN_PROGRESS',
        serviceItems: {
          create: [
            {
              serviceType: 'ACCOMMODATION',
              province: 'Pinar del Río',
              serviceDateStart: utcDay(-1),
              serviceDateEnd: utcDay(5),
            },
          ],
        },
      },
    });
    reservationId = reservation.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const advisoryIds = (
      await prisma.advisory.findMany({
        where: { disruptionCaseId: caseId || undefined },
        select: { id: true },
      })
    ).map((row) => row.id);
    if (caseId) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { entityType: 'DisruptionCase', entityId: caseId },
            { entityType: 'Advisory', entityId: { in: advisoryIds } },
          ],
        },
      });
      await prisma.advisory.deleteMany({ where: { id: { in: advisoryIds } } });
      await prisma.disruptionCase.deleteMany({ where: { id: caseId } });
    }
    await prisma.reservation.deleteMany({ where: { id: reservationId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ops.id, traveler.id].filter(Boolean) } },
    });
    await prisma.$disconnect();
  });

  it('opens a case that suggests the trip under way in its province', async () => {
    const opened = await service.create(ops, {
      scenario: 'outage',
      severity: 'MAJOR',
      province: 'CU01',
      title: `Power outage ${stamp}`,
      summary: 'Province-wide outage.',
      reservationIds: [],
    });
    caseId = opened.id;
    expect(opened.reference).toMatch(/^DC-\d{4,}$/);
    expect(opened.steps).toHaveLength(1);
    expect(opened.suggestions.map((item) => item.reservationId)).toContain(reservationId);

    const attached = await service.attach(ops, caseId, {
      reservationIds: [reservationId],
      bookingCodes: [],
    });
    expect(attached.bookings.map((item) => item.reservationId)).toEqual([reservationId]);
    expect(attached.suggestions.map((item) => item.reservationId)).not.toContain(
      reservationId,
    );
    expect(attached.counts.onTheGround).toBe(1);
  });

  it('emails E-Options once and takes one answer when two arrive at once', async () => {
    await service.sendOptions(ops, caseId, {
      deadline: new Date(Date.now() + 4 * HOUR),
      defaultOptionKey: 'A',
      reservationIds: [reservationId],
    });
    await service.deliver(caseId);
    expect(sent.filter((message) => message.to === travelerEmail)).toHaveLength(1);

    const [offer] = await service.mine(traveler, { reservationId });
    const results = await Promise.allSettled([
      service.choose(traveler, offer!.id, 'A'),
      service.choose(traveler, offer!.id, 'B'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const refused = results.find((result) => result.status === 'rejected') as
      PromiseRejectedResult | undefined;
    expect(refused?.reason).toBeInstanceOf(ConflictException);

    const desk = await service.get(caseId);
    expect(desk.bookings[0]!.offerState).toBe('CHOSEN');
    expect(desk.bookings[0]!.choiceSource).toBe('TRAVELER');
    expect(
      desk.log.filter((entry) => entry.action === 'disruption.choice_recorded'),
    ).toHaveLength(1);
  });

  it('drafts the case banner as a linked advisory, once', async () => {
    const advisory = await service.draftAdvisory(ops, caseId);
    expect(advisory.severity).toBe('CAUTION');
    expect(advisory.regions).toEqual(['CU01']);
    expect(advisory.disruptionCase?.id).toBe(caseId);
    expect((await service.draftAdvisory(ops, caseId)).id).toBe(advisory.id);
    const desk = await service.get(caseId);
    expect(desk.advisories.map((item) => item.id)).toEqual([advisory.id]);
  });
});

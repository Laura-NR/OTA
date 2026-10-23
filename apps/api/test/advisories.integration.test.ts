import { parseTenantConfig } from '@ota/config';
import { PrismaClient } from '@ota/db';
import type { EmailMessage } from '@ota/email';
import type { AdvisoryWriteRequest } from '@ota/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdvisoriesService } from '../src/advisories/advisories.service';
import type { AuthUser } from '../src/common/auth/auth-user';
import type { PrismaService } from '../src/prisma/prisma.service';
import { fakeOperatingSettings } from './fixtures/operating-settings';

// Prisma Client auto-loads packages/db/.env, so require an explicit opt-in.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

const tenant = parseTenantConfig({
  tenantId: 'test-agency',
  branding: { agencyName: 'Test Agency', licenseNumber: 'MINTUR-TEST-1234' },
});

const DAY = 86_400_000;

function utcDay(offsetDays: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays),
  );
}

/**
 * Live proof of M7 against Postgres: a critical advisory publishes only on an
 * Operations Admin and a Super Admin approving (even at the same instant),
 * E-Advisory reaches the traveler with a secured trip in the region once, the
 * acknowledgement is recorded once, a new version supersedes the published
 * one and lands in the history, and lifting ends it.
 * Run with `RUN_DB_INTEGRATION=1 pnpm --filter @ota/api exec vitest run
 * test/advisories.integration.test.ts` against a migrated dev database.
 */
describe.skipIf(!runIntegration)('advisories (live Postgres)', () => {
  let prisma: PrismaClient;
  let service: AdvisoriesService;
  let ops: AuthUser;
  let superAdmin: AuthUser;
  let traveler: AuthUser;
  let reservationId = '';
  const advisoryIds: string[] = [];
  const stamp = Date.now();
  const sent: EmailMessage[] = [];
  const travelerEmail = `advisory-it-${stamp}@example.test`;

  const draft = (): AdvisoryWriteRequest => ({
    severity: 'CRITICAL',
    regions: ['CU01'],
    effectiveFrom: new Date(Date.now() - 60_000),
    expiresAt: new Date(Date.now() + 14 * DAY),
    source: 'Insmet watch',
    sourceLocale: 'en',
    showOnSite: true,
    showOnPackages: true,
    notifyTravelers: true,
    translations: [
      {
        locale: 'en',
        headline: `Storm watch ${stamp}`,
        body: 'Stay indoors.',
        cta: null,
      },
      { locale: 'es', headline: `Alerta ${stamp}`, body: 'Quédate dentro.', cta: null },
      { locale: 'fr', headline: `Alerte ${stamp}`, body: "Restez à l'abri.", cta: null },
    ],
  });

  beforeAll(async () => {
    prisma = new PrismaClient();
    service = new AdvisoriesService(
      prisma as unknown as PrismaService,
      { send: async (message) => void sent.push(message) },
      tenant,
      fakeOperatingSettings(),
    );
    const make = async (role: AuthUser['role'], email: string) => {
      const user = await prisma.user.create({
        data: { email, fullName: email.split('@')[0], role, locale: 'en' },
      });
      return { id: user.id, email: user.email, role } as AuthUser;
    };
    ops = await make(
      'OPERATIONS_ADMIN' as AuthUser['role'],
      `adv-ops-${stamp}@example.test`,
    );
    superAdmin = await make(
      'SUPER_ADMIN' as AuthUser['role'],
      `adv-super-${stamp}@example.test`,
    );
    traveler = await make('TRAVELER' as AuthUser['role'], travelerEmail);

    const reservation = await prisma.reservation.create({
      data: {
        userId: traveler.id,
        bookingCode: `ADV${String(stamp).slice(-5)}`,
        startDate: utcDay(10),
        endDate: utcDay(17),
        status: 'CONFIRMED',
        serviceItems: {
          create: [
            {
              serviceType: 'ACCOMMODATION',
              province: 'Pinar del Río',
              serviceDateStart: utcDay(10),
              serviceDateEnd: utcDay(17),
            },
          ],
        },
      },
    });
    reservationId = reservation.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.auditLog.deleteMany({
      where: { entityType: 'Advisory', entityId: { in: advisoryIds } },
    });
    await prisma.advisory.updateMany({
      where: { id: { in: advisoryIds } },
      data: { supersedesId: null },
    });
    await prisma.advisory.deleteMany({ where: { id: { in: advisoryIds } } });
    await prisma.reservation.deleteMany({ where: { id: reservationId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ops.id, superAdmin.id, traveler.id].filter(Boolean) } },
    });
    await prisma.$disconnect();
  });

  it('publishes a critical advisory on two people approving at once, and emails once', async () => {
    const created = await service.create(ops, draft());
    advisoryIds.push(created.id);
    expect(created.status).toBe('DRAFT');
    expect(created.reference).toMatch(/^ADV-\d{4}-\d{3,}$/);

    await Promise.all([
      service.approve(ops, created.id),
      service.approve(superAdmin, created.id),
    ]);

    const published = await service.get(created.id);
    expect(published.status).toBe('PUBLISHED');
    expect(published.approvals).toHaveLength(2);
    const mine = sent.filter((message) => message.to === travelerEmail);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.subject).toContain(`Storm watch ${stamp}`);

    await service.deliver(created.id);
    expect(sent.filter((message) => message.to === travelerEmail)).toHaveLength(1);

    const active = await service.active({ locale: 'es', province: 'CU01' });
    const shown = active.find((item) => item.id === created.id);
    expect(shown?.headline).toBe(`Alerta ${stamp}`);
    expect(
      (await service.active({ province: 'CU03' })).map((item) => item.id),
    ).not.toContain(created.id);
  });

  it('records the critical acknowledgement once', async () => {
    const id = advisoryIds[0]!;
    const first = await service.acknowledge(traveler, id);
    const again = await service.acknowledge(traveler, id);
    expect(again.acknowledgedAt).toBe(first.acknowledgedAt);
    expect((await service.acknowledgements(traveler)).advisoryIds).toContain(id);
    expect((await service.get(id)).acknowledgementCount).toBe(1);
  });

  it('supersedes the published advisory with a new version, then lifts it', async () => {
    const original = advisoryIds[0]!;
    const version = await service.createVersion(ops, original);
    advisoryIds.push(version.id);
    expect(version.supersedesId).toBe(original);
    expect(version.reference.endsWith('-2')).toBe(true);
    // Opening the version again returns the same draft.
    expect((await service.createVersion(superAdmin, original)).id).toBe(version.id);

    await service.update(ops, version.id, { ...draft(), notifyTravelers: false });
    await service.approve(ops, version.id);
    const live = await service.approve(superAdmin, version.id);
    expect(live.status).toBe('PUBLISHED');
    expect((await service.get(original)).status).toBe('SUPERSEDED');
    expect((await service.history({ limit: 50 })).map((item) => item.id)).toContain(
      original,
    );

    const lifted = await service.lift(ops, version.id, 'Downgraded');
    expect(lifted.status).toBe('LIFTED');
    expect((await service.active({})).map((item) => item.id)).not.toContain(version.id);
  });
});

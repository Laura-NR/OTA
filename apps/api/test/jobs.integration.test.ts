import { PrismaClient } from '@ota/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import type { EscalationPublisher } from '../src/escalation/escalation.publisher';
import { JobsService } from '../src/jobs/jobs.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { QualityService } from '../src/quality/quality.service';

// Prisma Client auto-loads packages/db/.env, so DATABASE_URL is present; require
// an explicit opt-in so the default unit suite stays database-free.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

/**
 * Live proof of W-Job against Postgres (`docs/schema-w-job.md`): a step written
 * once through the guarded update, the last one marking the job FULFILLED; a
 * report sent twice kept once by the `client_ref` unique index; the desk's
 * acknowledgement taking it off the open emergencies. Run with
 * `RUN_DB_INTEGRATION=1 pnpm --filter @ota/api exec vitest run
 * test/jobs.integration.test.ts` against a migrated dev database.
 */
describe.skipIf(!runIntegration)('JobsService (live Postgres)', () => {
  let prisma: PrismaClient;
  let jobs: JobsService;
  let quality: QualityService;
  const published: string[] = [];
  const suffix = String(Date.now()).slice(-6);
  let worker: AuthUser;
  let desk: AuthUser;
  let supplierId = '';
  let reservationId = '';
  let serviceItemId = '';

  beforeAll(async () => {
    prisma = new PrismaClient();
    const publisher: EscalationPublisher = {
      publish: (event) => published.push(event.type),
    };
    jobs = new JobsService(prisma as unknown as PrismaService, publisher);
    quality = new QualityService(prisma as unknown as PrismaService, publisher);

    const workerUser = await prisma.user.create({
      data: {
        email: `wjob-${suffix}@example.test`,
        role: 'SERVICE_WORKER',
        fullName: 'Lázaro W',
      },
    });
    const staff = await prisma.user.create({
      data: { email: `wjob-desk-${suffix}@example.test`, role: 'OPERATIONS_ADMIN' },
    });
    const traveler = await prisma.user.create({
      data: { email: `wjob-traveler-${suffix}@example.test`, role: 'TRAVELER' },
    });
    worker = {
      id: workerUser.id,
      email: workerUser.email,
      role: 'SERVICE_WORKER',
    } as AuthUser;
    desk = { id: staff.id, email: staff.email, role: 'OPERATIONS_ADMIN' } as AuthUser;

    const supplier = await prisma.supplierProfile.create({
      data: {
        userId: workerUser.id,
        category: 'PRIVATE_DRIVER',
        primaryPhone: '+53 5 241 0077',
        provincesActive: ['La Habana'],
        rtnLicenseNumber: `RTN-WJOB-${suffix}`,
        verificationStatus: 'VERIFIED',
      },
    });
    supplierId = supplier.id;
    const reservation = await prisma.reservation.create({
      data: {
        userId: traveler.id,
        bookingCode: `WJ${suffix}`,
        startDate: new Date(),
        endDate: new Date(),
        status: 'CONFIRMED',
        serviceItems: {
          create: [
            {
              serviceType: 'TRANSPORTATION',
              province: 'La Habana',
              serviceDateStart: new Date(),
              serviceDateEnd: new Date(),
              status: 'ACCEPTED',
              supplierId,
              respondedAt: new Date(Date.now() - 60 * 60_000),
            },
          ],
        },
      },
      include: { serviceItems: true },
    });
    reservationId = reservation.id;
    serviceItemId = reservation.serviceItems[0]!.id;
  });

  afterAll(async () => {
    if (reservationId) {
      await prisma.auditLog.deleteMany({
        where: { metadata: { path: ['reservationId'], equals: reservationId } },
      });
      await prisma.reservation.delete({ where: { id: reservationId } });
    }
    if (supplierId) await prisma.supplierProfile.delete({ where: { id: supplierId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'wjob-', endsWith: `${suffix}@example.test` } },
    });
    await prisma.$disconnect();
  });

  it('records each step once and finishes the job on the last', async () => {
    const at = new Date(Date.now() - 10 * 60_000).toISOString();
    const first = await jobs.workerStep(worker, serviceItemId, {
      step: 'ARRIVED',
      occurredAt: at,
    });
    const again = await jobs.workerStep(worker, serviceItemId, {
      step: 'ARRIVED',
      occurredAt: new Date().toISOString(),
    });
    expect(again.ARRIVED).toBe(first.ARRIVED);
    await expect(
      jobs.workerStep(worker, serviceItemId, { step: 'EN_ROUTE', occurredAt: at }),
    ).rejects.toThrow('A later step is already recorded');

    await jobs.deskStep(desk, serviceItemId, {
      step: 'FINISHED',
      occurredAt: new Date().toISOString(),
    });
    const row = await prisma.serviceItem.findUniqueOrThrow({
      where: { id: serviceItemId },
    });
    expect(row.status).toBe('FULFILLED');
    expect(row.enRouteAt).toBeNull();
    expect(row.arrivedAt?.toISOString()).toBe(first.ARRIVED);
    expect(
      await prisma.auditLog.count({
        where: { entityId: serviceItemId, action: 'service_item.step_recorded' },
      }),
    ).toBe(2);
  });

  it('keeps a report sent twice once, and the acknowledgement clears the alert', async () => {
    const report = {
      category: 'MECHANICAL' as const,
      occurredAt: new Date().toISOString(),
      clientRef: crypto.randomUUID(),
      position: { latitude: 23.113612, longitude: -82.366581, accuracyM: 8 },
    };
    const [one, two] = await Promise.all([
      jobs.reportEmergency(worker, serviceItemId, report),
      jobs.reportEmergency(worker, serviceItemId, report),
    ]);
    expect(two.incidentId).toBe(one.incidentId);
    expect(await prisma.incident.count({ where: { clientRef: report.clientRef } })).toBe(
      1,
    );

    const open = await quality.openEmergencies();
    const mine = open.find((incident) => incident.id === one.incidentId);
    expect(mine).toMatchObject({
      source: 'WORKER_APP',
      severity: 'CRITICAL',
      supplierPhone: '+53 5 241 0077',
      position: { latitude: 23.113612, longitude: -82.366581, accuracyM: 8 },
    });

    await quality.acknowledgeIncident(one.incidentId, desk);
    expect(
      (await quality.openEmergencies()).some(
        (incident) => incident.id === one.incidentId,
      ),
    ).toBe(false);
    expect(published.filter((type) => type === 'incident.emergency')).toHaveLength(1);
    expect(published).toContain('incident.acknowledged');
  });
});

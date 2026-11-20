import { parseTenantConfig } from '@ota/config';
import { PrismaClient } from '@ota/db';
import { workerToday } from '@ota/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import type { DocumentRenderer } from '../src/documents/document-renderer';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SupplierPayoutsService } from '../src/suppliers/supplier-payouts.service';
import { fakeOperatingSettings } from './fixtures/operating-settings';

// Prisma Client auto-loads packages/db/.env, so DATABASE_URL is present; require
// an explicit opt-in so the default unit suite stays database-free.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Live proof of recording a worker payment (W-Earnings E1) against Postgres:
 * the payment row, the jobs settled with its id and the audit row land
 * together, and two desks paying the same job at once leave one payment, not
 * two. Run with `RUN_DB_INTEGRATION=1 pnpm --filter @ota/api exec vitest run
 * test/supplier-payouts.integration.test.ts` against a migrated dev database.
 */
describe.skipIf(!runIntegration)('SupplierPayoutsService (live Postgres)', () => {
  let prisma: PrismaClient;
  let service: SupplierPayoutsService;
  let actor: AuthUser;
  let supplierId = '';
  let itemIds: string[] = [];
  const suffix = Date.now();
  const emails = [
    `payout-ops-${suffix}@example.test`,
    `payout-worker-${suffix}@example.test`,
  ];

  beforeAll(async () => {
    prisma = new PrismaClient();
    service = new SupplierPayoutsService(
      prisma as unknown as PrismaService,
      fakeOperatingSettings(),
      parseTenantConfig({
        tenantId: 'test-agency',
        branding: { agencyName: 'Test Agency', licenseNumber: 'MINTUR-TEST-1234' },
      }),
      {} as DocumentRenderer,
    );

    const ops = await prisma.user.create({
      data: { email: emails[0]!, role: 'OPERATIONS_ADMIN' },
    });
    actor = { id: ops.id, email: ops.email, role: 'OPERATIONS_ADMIN' } as AuthUser;
    const worker = await prisma.user.create({
      data: { email: emails[1]!, role: 'SERVICE_WORKER' },
    });
    const supplier = await prisma.supplierProfile.create({
      data: {
        userId: worker.id,
        category: 'PRIVATE_DRIVER',
        primaryPhone: '+53 5555 0199',
        provincesActive: ['La Habana'],
        rtnLicenseNumber: `RTN-PAY-${suffix}`,
        verificationStatus: 'VERIFIED',
      },
    });
    supplierId = supplier.id;
    const ended = new Date(Date.now() - 3 * DAY_MS);
    const reservation = await prisma.reservation.create({
      data: {
        userId: ops.id,
        bookingCode: `PAY${String(suffix).slice(-5)}`,
        startDate: new Date(Date.now() - 4 * DAY_MS),
        endDate: ended,
        status: 'IN_PROGRESS',
        totalCurrency: 'EUR',
        totalAmount: '500.00',
        serviceItems: {
          create: ['90.10', '25.20', '60.00'].map((rate) => ({
            supplierId,
            serviceType: 'TRANSPORTATION' as const,
            serviceDateStart: new Date(ended.getTime() - 3 * 60 * 60 * 1000),
            serviceDateEnd: ended,
            status: 'ACCEPTED' as const,
            payoutRate: rate,
          })),
        },
      },
      include: { serviceItems: { orderBy: { payoutRate: 'desc' } } },
    });
    itemIds = reservation.serviceItems.map((item) => item.id);
  });

  afterAll(async () => {
    if (supplierId) {
      await prisma.auditLog.deleteMany({ where: { entityId: supplierId } });
      await prisma.reservation.deleteMany({
        where: { serviceItems: { some: { supplierId } } },
      });
      // Cascades to its payments.
      await prisma.supplierProfile.deleteMany({ where: { id: supplierId } });
    }
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });

  it('writes the payment, settles its jobs and audits it in one go', async () => {
    const ledger = await service.record(
      supplierId,
      {
        serviceItemIds: itemIds.slice(0, 2),
        method: 'CASH_OFFICE',
        paidAt: workerToday(new Date()),
      },
      actor,
    );

    const payments = await prisma.supplierPayout.findMany({ where: { supplierId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]!.amount.toFixed(2)).toBe('150.10');
    const items = await prisma.serviceItem.findMany({
      where: { id: { in: itemIds.slice(0, 2) } },
    });
    expect(items.map((item) => [item.payoutStatus, item.payoutId])).toEqual([
      ['SETTLED', payments[0]!.id],
      ['SETTLED', payments[0]!.id],
    ]);
    const audit = await prisma.auditLog.findMany({
      where: { entityId: supplierId, action: 'supplier.payout_recorded' },
    });
    expect(audit).toHaveLength(1);
    expect(ledger.payable.map((job) => job.payout)).toEqual(['25.20']);
  });

  it('pays a job once when two desks record it at the same moment', async () => {
    const paidAt = workerToday(new Date());
    const results = await Promise.allSettled(
      [0, 1].map(() =>
        service.record(
          supplierId,
          { serviceItemIds: [itemIds[2]!], method: 'CASH_OFFICE', paidAt },
          actor,
        ),
      ),
    );

    expect(results.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    const payments = await prisma.supplierPayout.findMany({
      where: { supplierId },
      include: { serviceItems: true },
    });
    // The losing transaction left no empty payment behind.
    expect(payments).toHaveLength(2);
    expect(payments.every((payment) => payment.serviceItems.length > 0)).toBe(true);
    const audit = await prisma.auditLog.count({
      where: { entityId: supplierId, action: 'supplier.payout_recorded' },
    });
    expect(audit).toBe(2);
  });
});

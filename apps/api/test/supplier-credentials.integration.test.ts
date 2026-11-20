import { PrismaClient } from '@ota/db';
import { InMemoryObjectStorage } from '@ota/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { SmsChannel, SmsMessage } from '../src/sms/sms.channel';
import { SupplierCredentialsService } from '../src/suppliers/supplier-credentials.service';
import { fakeOperatingSettings } from './fixtures/operating-settings';

// Prisma Client auto-loads packages/db/.env, so DATABASE_URL is present; require
// an explicit opt-in so the default unit suite stays database-free.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

const DAY_MS = 24 * 60 * 60 * 1000;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).toString('base64');

/**
 * Live proof of W-Credentials against Postgres: a worker's upload, the desk's
 * approval of the renewal, the old version superseded, and the expiry dispatch
 * reads recomputed from the date columns. Run with `RUN_DB_INTEGRATION=1 pnpm --filter @ota/api exec vitest
 * run test/supplier-credentials.integration.test.ts` against a migrated dev
 * database.
 */
describe.skipIf(!runIntegration)('SupplierCredentialsService (live Postgres)', () => {
  let prisma: PrismaClient;
  let service: SupplierCredentialsService;
  const texts: SmsMessage[] = [];
  const suffix = String(Date.now()).slice(-6);
  let supplierId = '';
  let worker: AuthUser;
  let reviewer: AuthUser;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const sms: SmsChannel = {
      delivers: false,
      send: async (message) => {
        texts.push(message);
      },
    };
    service = new SupplierCredentialsService(
      prisma as unknown as PrismaService,
      new InMemoryObjectStorage(),
      fakeOperatingSettings({ credentialExpiryWindowDays: 30 }),
      sms,
    );

    const workerUser = await prisma.user.create({
      data: {
        email: `credentials-${suffix}@example.test`,
        role: 'SERVICE_WORKER',
        fullName: 'Yoel Credenciales',
      },
    });
    const staff = await prisma.user.create({
      data: {
        email: `credentials-desk-${suffix}@example.test`,
        role: 'OPERATIONS_ADMIN',
        fullName: 'Ernesto Valdés',
      },
    });
    worker = {
      id: workerUser.id,
      email: workerUser.email,
      role: 'SERVICE_WORKER',
    } as AuthUser;
    reviewer = { id: staff.id, email: staff.email, role: 'OPERATIONS_ADMIN' } as AuthUser;

    const supplier = await prisma.supplierProfile.create({
      data: {
        userId: workerUser.id,
        category: 'PRIVATE_DRIVER',
        primaryPhone: '+53 5 241 0042',
        provincesActive: ['La Habana'],
        rtnLicenseNumber: `RTN-CRED-${suffix}`,
        verificationStatus: 'VERIFIED',
        credentialExpiresAt: new Date('2027-03-01T00:00:00Z'),
      },
    });
    supplierId = supplier.id;
  });

  afterAll(async () => {
    if (supplierId) {
      await prisma.auditLog.deleteMany({ where: { entityId: supplierId } });
      await prisma.supplierProfile.delete({ where: { id: supplierId } });
    }
    await prisma.user.deleteMany({
      where: {
        email: { startsWith: 'credentials-', endsWith: `${suffix}@example.test` },
      },
    });
    await prisma.$disconnect();
  });

  it('takes a renewal from the app, approves it, supersedes the old one and recomputes the expiry', async () => {
    await prisma.supplierCredential.createMany({
      data: [
        {
          supplierId,
          kind: 'TRANSPORT_LICENCE',
          status: 'VERIFIED',
          expiresOn: new Date(Date.now() + 20 * DAY_MS),
          uploadedVia: 'VISIT',
        },
        {
          supplierId,
          kind: 'LIABILITY_INSURANCE',
          status: 'VERIFIED',
          expiresOn: new Date('2028-01-31T00:00:00Z'),
          uploadedVia: 'VISIT',
        },
      ],
    });

    const before = await service.forWorker(worker);
    expect(before.summary).toMatchObject({ state: 'EXPIRING', autoOffers: false });

    const uploaded = await service.uploadForWorker(worker, {
      kind: 'TRANSPORT_LICENCE',
      filename: 'licencia.jpg',
      contentType: 'image/jpeg',
      contentBase64: PNG,
    });
    expect(uploaded.summary.state).toBe('IN_REVIEW');
    const pending = uploaded.slots[0]!.pending!;
    expect(pending.uploadedVia).toBe('WORKER_APP');

    const listed = await service.approve(
      supplierId,
      pending.id,
      {
        number: 'LOT-HAB-2026-02210',
        issuer: 'Ministerio de Transporte · La Habana',
        issuedOn: '2026-11-01',
        expiresOn: '2028-06-12',
      },
      reviewer,
    );

    expect(listed.slots[0]!.current).toMatchObject({
      id: pending.id,
      expiresOn: '2028-06-12',
      reviewedByName: 'Ernesto',
    });
    const licences = await prisma.supplierCredential.findMany({
      where: { supplierId, kind: 'TRANSPORT_LICENCE' },
      orderBy: { uploadedAt: 'asc' },
    });
    expect(licences.map((row) => row.status)).toEqual(['SUPERSEDED', 'VERIFIED']);
    const profile = await prisma.supplierProfile.findUniqueOrThrow({
      where: { id: supplierId },
    });
    expect(profile.credentialExpiresAt).toEqual(new Date('2028-01-31T00:00:00Z'));
    expect(texts.at(-1)?.to).toBe('+5352410042');

    const after = await service.forWorker(worker);
    expect(after.summary).toMatchObject({ state: 'ACTIVE', autoOffers: true });
  });
});

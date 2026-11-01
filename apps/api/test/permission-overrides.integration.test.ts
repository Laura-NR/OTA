import { parseTenantConfig } from '@ota/config';
import { PrismaClient } from '@ota/db';
import type { EmailMessage, Mailer } from '@ota/email';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import { PermissionOverridesService } from '../src/overrides/permission-overrides.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { fakeOperatingSettings } from './fixtures/operating-settings';

// Prisma Client auto-loads packages/db/.env, so DATABASE_URL is present; require
// an explicit opt-in so the default unit suite stays database-free.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

const HOUR = 60 * 60 * 1000;

/**
 * Live proof of permission overrides against Postgres
 * (`docs/schema-m9-permission-overrides.md`): the guard's lookup finds only
 * a running override for its row, the clock ends it, ending it is immediate,
 * and Settings › Permissions splits the rows. Run with `RUN_DB_INTEGRATION=1
 * pnpm --filter @ota/api exec vitest run
 * test/permission-overrides.integration.test.ts` against a migrated dev database.
 */
describe.skipIf(!runIntegration)('PermissionOverridesService (live Postgres)', () => {
  let prisma: PrismaClient;
  let service: PermissionOverridesService;
  let support: AuthUser;
  let superAdmin: AuthUser;
  const sent: EmailMessage[] = [];
  const suffix = Date.now();

  beforeAll(async () => {
    prisma = new PrismaClient();
    const mailer: Mailer = { send: async (message) => void sent.push(message) };
    service = new PermissionOverridesService(
      prisma as unknown as PrismaService,
      fakeOperatingSettings({ overrideExpiryHours: 2 }),
      mailer,
      parseTenantConfig({
        tenantId: 'test-agency',
        branding: { agencyName: 'Test Agency', licenseNumber: 'MINTUR-TEST-1234' },
      }),
    );
    const supportRow = await prisma.user.create({
      data: {
        email: `override-int-support-${suffix}@example.test`,
        role: 'ADMINISTRATIVE_SUPPORT',
      },
    });
    const adminRow = await prisma.user.create({
      data: { email: `override-int-admin-${suffix}@example.test`, role: 'SUPER_ADMIN' },
    });
    support = {
      id: supportRow.id,
      email: supportRow.email,
      role: 'ADMINISTRATIVE_SUPPORT',
    };
    superAdmin = { id: adminRow.id, email: adminRow.email, role: 'SUPER_ADMIN' };
  });

  afterAll(async () => {
    const ids = [support?.id, superAdmin?.id].filter(Boolean) as string[];
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
    // Overrides cascade with their holder.
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('grants one row from approval until the threshold ends it, and ending is immediate', async () => {
    const now = new Date();
    const asked = await service.request(
      support,
      { capability: 'payments', reason: 'Covering the payments desk' },
      now,
    );
    expect(sent.some((email) => email.to === superAdmin.email)).toBe(true);
    expect(await service.activeFor(support.id, 'payments', now)).toBeNull();

    await service.approve(superAdmin, asked.id, {}, now);
    expect(await service.activeFor(support.id, 'payments', now)).toEqual({
      id: asked.id,
    });
    expect(await service.activeFor(support.id, 'catalog', now)).toBeNull();
    expect(
      await service.activeFor(support.id, 'payments', new Date(now.getTime() + 2 * HOUR)),
    ).toBeNull();

    const listed = await service.list(now);
    expect(listed.active.map((item) => item.id)).toContain(asked.id);

    await service.end(superAdmin, asked.id, { note: 'Ana is back' }, now);
    expect(await service.activeFor(support.id, 'payments', now)).toBeNull();
    const after = await service.list(now);
    expect(after.recent.find((item) => item.id === asked.id)).toMatchObject({
      status: 'ENDED',
      endNote: 'Ana is back',
    });

    const actions = await prisma.auditLog.findMany({
      where: { entityType: 'PermissionOverride', entityId: asked.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });
    expect(actions.map((row) => row.action)).toEqual([
      'permission.override_requested',
      'permission.override_approved',
      'permission.override_ended',
    ]);
  });

  it('shows the holder a request that lapsed unanswered as lapsed, and lets them ask again', async () => {
    const dayAgo = new Date(Date.now() - 25 * HOUR);
    const old = await service.request(
      support,
      { capability: 'catalog', reason: 'Fix a price' },
      dayAgo,
    );
    const mine = await service.mine(support);
    expect(mine.overrides.find((item) => item.id === old.id)?.status).toBe('LAPSED');
    await expect(
      service.request(support, { capability: 'catalog', reason: 'Fix a price, again' }),
    ).resolves.toMatchObject({ status: 'REQUESTED' });
  });
});

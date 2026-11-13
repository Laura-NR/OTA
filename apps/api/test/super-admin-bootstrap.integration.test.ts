import { PrismaClient } from '@ota/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  SUPER_ADMIN_BOOTSTRAP_ACTION,
  bootstrapSuperAdmins,
} from '../src/staff/super-admin-bootstrap';

// Prisma Client auto-loads packages/db/.env, so DATABASE_URL is always present;
// require an explicit opt-in so the default unit suite stays database-free.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

class Rollback extends Error {}

/**
 * Live proof of the first-Super-Admin command (deployment plan B9) against
 * Postgres. Every case runs in a transaction that is always rolled back, so
 * the dev database's seeded Super Admins are never changed. Run with
 * `RUN_DB_INTEGRATION=1 pnpm --filter @ota/api exec vitest run
 * test/super-admin-bootstrap.integration.test.ts` against a migrated dev database.
 */
describe.skipIf(!runIntegration)('bootstrapSuperAdmins (live Postgres)', () => {
  let prisma: PrismaClient;
  const stamp = Date.now();
  const founder = `founder-${stamp}@bootstrap.test`;
  const partner = `partner-${stamp}@bootstrap.test`;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Run `body` in a transaction, keep what it returns, and roll everything back. */
  async function rolledBack<T>(
    body: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>,
  ): Promise<T> {
    let kept: T | undefined;
    await expect(
      prisma.$transaction(async (tx) => {
        kept = await body(tx);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
    return kept as T;
  }

  it('refuses while the seeded Super Admins exist and writes nothing', async () => {
    const before = await prisma.auditLog.count({
      where: { action: SUPER_ADMIN_BOOTSTRAP_ACTION },
    });
    const outcome = await rolledBack(async (tx) => {
      await tx.user.create({ data: { email: founder, role: 'TRAVELER' } });
      const result = await bootstrapSuperAdmins(tx, [founder], []);
      const role = (await tx.user.findUniqueOrThrow({ where: { email: founder } })).role;
      return { result, role };
    });
    expect(outcome.result).toEqual({
      ok: false,
      refusals: [{ code: 'SUPER_ADMIN_EXISTS' }],
    });
    expect(outcome.role).toBe('TRAVELER');
    expect(
      await prisma.auditLog.count({ where: { action: SUPER_ADMIN_BOOTSTRAP_ACTION } }),
    ).toBe(before);
  });

  it('promotes the named founders and audits each, when no Super Admin exists', async () => {
    const outcome = await rolledBack(async (tx) => {
      await tx.user.updateMany({
        where: { role: 'SUPER_ADMIN' },
        data: { role: 'OPERATIONS_ADMIN' },
      });
      const a = await tx.user.create({ data: { email: founder, role: 'TRAVELER' } });
      const b = await tx.user.create({ data: { email: partner, role: 'TRAVELER' } });
      const result = await bootstrapSuperAdmins(
        tx,
        [founder.toUpperCase(), ` ${partner}`],
        ['bootstrap.test'],
      );
      const roles = await tx.user.findMany({
        where: { id: { in: [a.id, b.id] } },
        select: { role: true },
      });
      const audits = await tx.auditLog.findMany({
        where: { action: SUPER_ADMIN_BOOTSTRAP_ACTION, entityId: { in: [a.id, b.id] } },
        select: { actorUserId: true, entityType: true, metadata: true },
      });
      const again = await bootstrapSuperAdmins(tx, [founder], ['bootstrap.test']);
      return { result, roles, audits, again };
    });
    expect(outcome.result.ok).toBe(true);
    expect(outcome.roles.map((user) => user.role)).toEqual([
      'SUPER_ADMIN',
      'SUPER_ADMIN',
    ]);
    expect(outcome.audits).toHaveLength(2);
    for (const audit of outcome.audits) {
      expect(audit).toMatchObject({
        actorUserId: null,
        entityType: 'User',
        metadata: { from: 'TRAVELER', to: 'SUPER_ADMIN', via: 'bootstrap-command' },
      });
    }
    expect(outcome.again).toEqual({
      ok: false,
      refusals: [{ code: 'SUPER_ADMIN_EXISTS' }],
    });
  });

  it('promotes nobody when one named address has not signed in', async () => {
    const outcome = await rolledBack(async (tx) => {
      await tx.user.updateMany({
        where: { role: 'SUPER_ADMIN' },
        data: { role: 'OPERATIONS_ADMIN' },
      });
      await tx.user.create({ data: { email: founder, role: 'TRAVELER' } });
      const result = await bootstrapSuperAdmins(tx, [founder, partner], []);
      const supers = await tx.user.count({ where: { role: 'SUPER_ADMIN' } });
      return { result, supers };
    });
    expect(outcome.result).toEqual({
      ok: false,
      refusals: [{ code: 'NOT_FOUND', email: partner }],
    });
    expect(outcome.supers).toBe(0);
  });
});

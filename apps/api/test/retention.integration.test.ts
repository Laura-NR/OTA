import type { TenantConfig } from '@ota/config';
import { PrismaClient } from '@ota/db';
import type { Mailer } from '@ota/email';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../src/prisma/prisma.service';
import { NoopRetentionScheduler } from '../src/retention/retention.scheduler';
import { RetentionService } from '../src/retention/retention.service';

// Prisma Client auto-loads packages/db/.env, so DATABASE_URL is always present;
// require an explicit opt-in so the default unit suite stays database-free.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Live proof of the retention lifecycle against Postgres: the 6-month notice is
 * sent, the keep-alive link grants consent, and the 30-day grace anonymizes the
 * traveler while keeping the reservation. Run with
 * `RUN_DB_INTEGRATION=1 pnpm --filter @ota/api exec vitest run
 * test/retention.integration.test.ts` against a migrated dev database.
 */
describe.skipIf(!runIntegration)('RetentionService (live Postgres)', () => {
  let prisma: PrismaClient;
  let service: RetentionService;
  let send: ReturnType<typeof vi.fn>;
  let userId = '';
  let reservationId = '';
  const email = `retention-e2e-${Date.now()}@example.test`;

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= 'retention-integration-secret-0123456789';
    prisma = new PrismaClient();
    send = vi.fn(async () => undefined);
    service = new RetentionService(
      prisma as unknown as PrismaService,
      { send } as unknown as Mailer,
      {
        branding: {
          agencyName: 'Integration Test Agency',
          licenseNumber: 'MINTUR-TEST-0000',
          primaryColor: '#0f766e',
        },
      } as unknown as TenantConfig,
      new NoopRetentionScheduler(),
    );

    const user = await prisma.user.create({
      data: {
        email,
        fullName: 'Retention Test Traveler',
        phone: '+53 5555 9999',
        nationality: 'ES',
        role: 'TRAVELER',
      },
    });
    userId = user.id;

    const reservation = await prisma.reservation.create({
      data: {
        userId,
        bookingCode: `RTN${Date.now()}`,
        startDate: new Date(Date.now() - 220 * DAY_MS),
        endDate: new Date(Date.now() - 210 * DAY_MS),
        status: 'COMPLETED',
        completedAt: new Date(Date.now() - 200 * DAY_MS),
        totalCurrency: 'EUR',
        totalAmount: '321.00',
      },
    });
    reservationId = reservation.id;
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityType: 'User', entityId: userId },
          { entityType: 'Reservation', entityId: reservationId },
        ],
      },
    });
    await prisma.reservation.deleteMany({ where: { id: reservationId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('sends the notice, records consent, then anonymizes after the grace', async () => {
    const first = await service.scan();
    expect(first).toEqual({ noticed: 1, purged: 0 });
    expect(send).toHaveBeenCalledTimes(1);

    const message = send.mock.calls[0][0] as { to: string; html: string };
    expect(message.to).toBe(email);
    const match = message.html.match(/keep-alive\?token=([^"&<]+)/);
    expect(match).toBeTruthy();

    let user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.retentionNoticeSentAt).not.toBeNull();

    const consent = await service.confirmKeepAlive(decodeURIComponent(match![1]));
    expect(consent.status).toBe(200);
    user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.retentionConsentGrantedAt).not.toBeNull();

    // Simulate an ignored notice: rewind past the grace with no consent.
    await prisma.user.update({
      where: { id: userId },
      data: {
        retentionNoticeSentAt: new Date(Date.now() - 31 * DAY_MS),
        retentionConsentGrantedAt: null,
      },
    });

    const second = await service.scan();
    expect(second).toEqual({ noticed: 0, purged: 1 });

    user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).toBe(`anonymized+${userId}@anonymized.invalid`);
    expect(user.fullName).toBeNull();
    expect(user.phone).toBeNull();
    expect(user.nationality).toBeNull();
    expect(user.anonymizedAt).not.toBeNull();

    // The fiscal record survives the purge.
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    expect(reservation).not.toBeNull();
    expect(reservation?.totalAmount.toString()).toBe('321');
  }, 20_000);
});

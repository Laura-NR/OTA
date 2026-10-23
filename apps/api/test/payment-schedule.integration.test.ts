import { parseTenantConfig } from '@ota/config';
import { PrismaClient } from '@ota/db';
import { MockPaymentProvider, BankTransferProvider } from '@ota/payments';
import { InMemoryObjectStorage } from '@ota/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import type { DocumentsService } from '../src/documents/documents.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ProofsService } from '../src/payments/proofs.service';
import { RefundsService } from '../src/payments/refunds.service';
import { ScheduleService } from '../src/payments/schedule.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ReservationsService } from '../src/reservations/reservations.service';
import { fakeOperatingSettings } from './fixtures/operating-settings';

// Prisma Client auto-loads packages/db/.env, so require an explicit opt-in.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

const tenant = parseTenantConfig({
  tenantId: 'test-agency',
  branding: { agencyName: 'Test Agency', licenseNumber: 'MINTUR-TEST-1234' },
  policies: {
    deposit: {
      standard: {
        percent: 20,
        minDaysBeforeDeparture: 60,
        balanceDaysBeforeDeparture: 30,
      },
    },
    cancellation: {
      standard: {
        bands: [
          { fromDays: 46, keepPercent: 0, fee: 60 },
          { fromDays: 0, keepPercent: 100 },
        ],
      },
    },
  },
});

/**
 * Live proof of M4 against Postgres: a deposit plan becomes two instalments,
 * the deposit confirms the booking and the balance is paid after; a proof of
 * transfer is stored and accepted; a refund collects two approvals and is
 * recorded as sent. Deleting the booking removes its schedule, receipts,
 * proofs and refunds in one statement (the refund's receipt link is NO
 * ACTION), while a refunded receipt cannot be deleted on its own. Run with
 * `RUN_DB_INTEGRATION=1 pnpm --filter @ota/api exec vitest run
 * test/payment-schedule.integration.test.ts` against a migrated dev database.
 */
describe.skipIf(!runIntegration)('M4 payment schedule (live Postgres)', () => {
  let prisma: PrismaClient;
  let payments: PaymentsService;
  let schedule: ScheduleService;
  let proofs: ProofsService;
  let refunds: RefundsService;
  let ops: AuthUser;
  let ops2: AuthUser;
  let owner: AuthUser;
  let packageId = '';
  let reservationId = '';
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaClient();
    const db = prisma as unknown as PrismaService;
    const providers = {
      OPEN_BANKING_SEPA: new BankTransferProvider(),
      OTHER: new BankTransferProvider(),
      CARD: new MockPaymentProvider(),
    };
    const reservations = new ReservationsService(
      db,
      { generate: async () => undefined } as unknown as DocumentsService,
      {
        bookingConfirmed: async () => undefined,
        bookingSecured: async () => undefined,
      } as unknown as NotificationsService,
    );
    payments = new PaymentsService(
      db,
      reservations,
      providers,
      tenant,
      fakeOperatingSettings(),
    );
    schedule = new ScheduleService(db, tenant, fakeOperatingSettings());
    proofs = new ProofsService(db, new InMemoryObjectStorage());
    refunds = new RefundsService(db, tenant, providers, fakeOperatingSettings());

    const user = (role: string, name: string) =>
      prisma.user.create({
        data: { email: `m4-${name}-${stamp}@example.test`, role: role as 'TRAVELER' },
      });
    const [a, b, c] = await Promise.all([
      user('OPERATIONS_ADMIN', 'ops'),
      user('OPERATIONS_ADMIN', 'ops2'),
      user('TRAVELER', 'owner'),
    ]);
    ops = { id: a.id, email: a.email, role: 'OPERATIONS_ADMIN' } as AuthUser;
    ops2 = { id: b.id, email: b.email, role: 'OPERATIONS_ADMIN' } as AuthUser;
    owner = { id: c.id, email: c.email, role: 'TRAVELER' } as AuthUser;

    const pkg = await prisma.package.create({
      data: {
        name: `M4 Trail ${stamp}`,
        slug: `m4-trail-${stamp}`,
        durationDays: 8,
        basePrice: '1000.00',
        depositPolicy: 'standard',
        cancellationPolicy: 'standard',
      },
    });
    packageId = pkg.id;
    const departure = new Date();
    departure.setUTCDate(departure.getUTCDate() + 120);
    departure.setUTCHours(0, 0, 0, 0);
    const reservation = await prisma.reservation.create({
      data: {
        userId: owner.id,
        packageId,
        bookingCode: `M4${String(stamp).slice(-6)}`,
        startDate: departure,
        endDate: new Date(departure.getTime() + 7 * 86_400_000),
        status: 'SECURED_AND_INVOICED',
        totalAmount: '3100.00',
      },
    });
    reservationId = reservation.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.auditLog.deleteMany({
      where: {
        actorUserId: { in: [ops?.id, ops2?.id, owner?.id].filter(Boolean) as string[] },
      },
    });
    await prisma.reservation.deleteMany({ where: { id: reservationId } });
    await prisma.package.deleteMany({ where: { id: packageId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ops?.id, ops2?.id, owner?.id].filter(Boolean) as string[] } },
    });
    await prisma.$disconnect();
  });

  it('runs a deposit, a proof, the balance and a dual-approved refund', async () => {
    const deposit = await payments.createIntent(
      reservationId,
      { rail: 'OPEN_BANKING_SEPA', plan: 'DEPOSIT' },
      ops,
    );
    expect(deposit.amount).toBe('620');

    const proof = await proofs.upload(owner, reservationId, deposit.id, {
      contentType: 'application/pdf',
      contentBase64: Buffer.from('%PDF-1.4 proof').toString('base64'),
    });
    const accepted = await proofs.accept(proof.id, {}, ops);
    expect(accepted.status).toBe('ACCEPTED');

    const confirmed = await payments.confirm(reservationId, deposit.id, ops);
    expect(confirmed.status).toBe('CONFIRMED');

    const balance = await payments.createIntent(
      reservationId,
      { rail: 'OPEN_BANKING_SEPA' },
      ops,
    );
    expect(balance.amount).toBe('2480');
    await payments.confirm(reservationId, balance.id, ops);

    const refund = await refunds.create(
      reservationId,
      {
        receiptId: deposit.id,
        reason: 'TRAVELER_CANCELLATION',
        note: 'Cancelled by email.',
      },
      ops,
    );
    // 120 days out, € 3,100 paid: the scale keeps € 60, all drawn from the deposit.
    expect(refund.amount).toBe('620.00');
    await refunds.vote(refund.id, true, undefined, ops);
    const approved = await refunds.vote(refund.id, true, undefined, ops2);
    expect(approved.status).toBe('APPROVED');
    const sent = await refunds.markSent(refund.id, `BANK-${stamp}`, ops);
    expect(sent.status).toBe('SENT');

    const view = await schedule.get(reservationId, { ownerId: owner.id });
    expect(view).toMatchObject({
      paid: '3100.00',
      refunded: '620.00',
      nextInstalmentId: null,
    });
    expect(view.instalments.map((row) => [row.kind, row.status])).toEqual([
      ['DEPOSIT', 'PAID'],
      ['BALANCE', 'PAID'],
    ]);
    expect(view.receipts[0]!.proofs[0]).toMatchObject({ status: 'ACCEPTED' });
  });

  it('keeps a refunded receipt, but deletes everything with its booking', async () => {
    const receipt = await prisma.paymentReceipt.findFirstOrThrow({
      where: { reservationId, refunds: { some: {} } },
    });
    await expect(
      prisma.paymentReceipt.delete({ where: { id: receipt.id } }),
    ).rejects.toThrow();

    await prisma.reservation.delete({ where: { id: reservationId } });
    expect(await prisma.refund.count({ where: { reservationId } })).toBe(0);
    expect(await prisma.paymentReceipt.count({ where: { reservationId } })).toBe(0);
    expect(await prisma.paymentInstalment.count({ where: { reservationId } })).toBe(0);
    expect(await prisma.paymentProof.count({ where: { receiptId: receipt.id } })).toBe(0);
  });
});

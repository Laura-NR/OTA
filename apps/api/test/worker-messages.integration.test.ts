import { randomUUID } from 'node:crypto';

import type { TenantConfig } from '@ota/config';
import { PrismaClient } from '@ota/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import { NoopEscalationPublisher } from '../src/escalation/escalation.publisher';
import { OpsLiteService } from '../src/ops-lite/ops-lite.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { WorkerMessagesService } from '../src/worker-messages/worker-messages.service';

// Prisma Client auto-loads packages/db/.env, so DATABASE_URL is present; require
// an explicit opt-in so the default unit suite stays database-free.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

/**
 * Live proof of worker ↔ desk messages against Postgres
 * (`docs/schema-w-messages.md`): a message resent at once, twice, is kept once
 * by the `client_ref` unique index; the desk's reply is read when the worker
 * opens the thread; AL-Inbox lists the worker's thread urgent beside the
 * travelers', and the booking's card shows the message about it. The purge is
 * proven in `retention.integration.test.ts`. Run with `RUN_DB_INTEGRATION=1
 * pnpm --filter @ota/api exec vitest run test/worker-messages.integration.test.ts`
 * against a migrated dev database.
 */
describe.skipIf(!runIntegration)('WorkerMessagesService (live Postgres)', () => {
  let prisma: PrismaClient;
  let messages: WorkerMessagesService;
  let opsLite: OpsLiteService;
  const suffix = String(Date.now()).slice(-6);
  let worker: AuthUser;
  let desk: AuthUser;
  let supplierId = '';
  let reservationId = '';
  let serviceItemId = '';

  beforeAll(async () => {
    prisma = new PrismaClient();
    messages = new WorkerMessagesService(
      prisma as unknown as PrismaService,
      new NoopEscalationPublisher(),
      { send: async () => undefined },
      {} as TenantConfig,
    );
    opsLite = new OpsLiteService(prisma as unknown as PrismaService, messages);

    const workerUser = await prisma.user.create({
      data: {
        email: `wmsg-${suffix}@example.test`,
        role: 'SERVICE_WORKER',
        fullName: 'Reinier W',
      },
    });
    const staff = await prisma.user.create({
      data: {
        email: `wmsg-desk-${suffix}@example.test`,
        role: 'OPERATIONS_ADMIN',
        fullName: 'Ana Desk',
      },
    });
    const traveler = await prisma.user.create({
      data: { email: `wmsg-traveler-${suffix}@example.test`, role: 'TRAVELER' },
    });
    worker = {
      id: workerUser.id,
      email: workerUser.email,
      role: 'SERVICE_WORKER',
    } as AuthUser;
    desk = { id: staff.id, email: staff.email, role: 'OPERATIONS_ADMIN' } as AuthUser;

    supplierId = (
      await prisma.supplierProfile.create({
        data: {
          userId: workerUser.id,
          category: 'PRIVATE_DRIVER',
          primaryPhone: '+53 5 241 3388',
          provincesActive: ['La Habana'],
          rtnLicenseNumber: `RTN-WMSG-${suffix}`,
          verificationStatus: 'VERIFIED',
        },
      })
    ).id;
    const reservation = await prisma.reservation.create({
      data: {
        userId: traveler.id,
        bookingCode: `WM${suffix}`,
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
    if (!prisma) return;
    // Worker messages cascade with the supplier.
    if (reservationId) await prisma.reservation.delete({ where: { id: reservationId } });
    if (supplierId) await prisma.supplierProfile.delete({ where: { id: supplierId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'wmsg-', endsWith: `${suffix}@example.test` } },
    });
    await prisma.$disconnect();
  });

  it('keeps a message the phone sends twice at once only once', async () => {
    const send = {
      body: 'Listo, salgo a las 15:30.',
      clientRef: randomUUID(),
      serviceItemId,
      writtenAt: new Date(Date.now() - 70 * 60_000).toISOString(),
    };
    const [first, second] = await Promise.all([
      messages.workerSend(worker, send),
      messages.workerSend(worker, send),
    ]);
    expect(second.id).toBe(first.id);
    expect(await prisma.workerMessage.count({ where: { supplierId } })).toBe(1);
    expect(first.bookingCode).toBe(`WM${suffix}`);
  });

  it("lists the worker's thread on AL-Inbox, urgent, and on the booking's card", async () => {
    const inbox = await opsLite.inbox();
    const thread = inbox.workers.find((row) => row.supplierId === supplierId);
    expect(thread).toMatchObject({
      workerName: 'Reinier W',
      urgent: true,
      jobToday: true,
      unread: 1,
      job: { serviceItemId, bookingCode: `WM${suffix}` },
    });
    expect(inbox.counts.workers).toBeGreaterThanOrEqual(1);
    expect(inbox.counts.all).toBe(inbox.threads.length + inbox.workers.length);

    const [card] = await messages.bookingThreads(reservationId);
    expect(card).toMatchObject({
      supplierId,
      unread: 1,
      serviceItemIds: [serviceItemId],
    });
  });

  it('reads the desk reply when the worker opens the thread, and the worker message when the desk does', async () => {
    await messages.deskSend(desk, supplierId, { body: 'Gracias.', serviceItemId });
    expect(await messages.deskMarkRead(supplierId)).toEqual({ read: 1 });
    const thread = await messages.workerThread(worker);
    expect(thread.unread).toBe(1);
    expect(thread.messages.at(-1)).toMatchObject({
      sender: 'OPERATIONS',
      authorName: 'Ana',
    });
    expect(await messages.workerMarkRead(worker)).toEqual({ read: 1 });
    expect((await messages.workerThread(worker)).unread).toBe(0);

    const inbox = await opsLite.inbox();
    expect(inbox.workers.find((row) => row.supplierId === supplierId)).toMatchObject({
      urgent: false,
      awaitingReply: false,
      unread: 0,
    });
  });
});

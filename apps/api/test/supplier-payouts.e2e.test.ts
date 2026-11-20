import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@ota/db';
import { workerToday } from '@ota/domain';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DOCUMENT_RENDERER } from '../src/documents/document-renderer';
import { PrismaService } from '../src/prisma/prisma.service';
import { withNoSettingsVersion } from './fixtures/operating-settings';

const OPS = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ops@example.test',
  role: 'OPERATIONS_ADMIN',
};
const WORKER = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'reinier@example.test',
  role: 'SERVICE_WORKER',
};
const PEER = {
  id: '44444444-4444-4444-8444-444444444444',
  email: 'peer@example.test',
  role: 'SERVICE_WORKER',
};

const DRIVER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PEER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DAY_MS = 24 * 60 * 60 * 1000;

interface Job {
  id: string;
  supplierId: string;
  status: string;
  serviceType: string;
  province: string | null;
  serviceDateEnd: Date;
  payoutRate: Prisma.Decimal;
  payoutStatus: string;
  payoutId: string | null;
  reservation: { status: string; bookingCode: string };
}

interface Payment {
  id: string;
  supplierId: string;
  method: string;
  currency: string;
  amount: Prisma.Decimal;
  paidAt: Date;
  recordedById: string | null;
  createdAt: Date;
}

function job(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id,
    supplierId: DRIVER_ID,
    status: 'ACCEPTED',
    serviceType: 'TRANSPORTATION',
    province: 'La Habana',
    serviceDateEnd: new Date(Date.now() - 2 * DAY_MS),
    payoutRate: new Prisma.Decimal('25.00'),
    payoutStatus: 'ACCRUED',
    payoutId: null,
    reservation: { status: 'CONFIRMED', bookingCode: 'VX4WQ7EB' },
    ...overrides,
  };
}

function createFakePrisma(jobs: Job[], payments: Payment[]) {
  const profiles = [
    {
      id: DRIVER_ID,
      userId: WORKER.id,
      primaryPhone: '+53 5555 0199',
      rtnLicenseNumber: 'RTN-0042',
      user: { fullName: 'Reinier Soto', email: WORKER.email },
    },
    {
      id: PEER_ID,
      userId: PEER.id,
      primaryPhone: '+53 5555 0200',
      rtnLicenseNumber: 'RTN-0043',
      user: { fullName: 'Peer', email: PEER.email },
    },
  ];
  const withPayout = (row: Job) => ({
    ...row,
    payout: row.payoutId
      ? { paidAt: payments.find((payment) => payment.id === row.payoutId)!.paidAt }
      : null,
  });

  const fake = {
    supplierProfile: {
      findUnique: async ({ where }: { where: { id?: string; userId?: string } }) =>
        profiles.find(
          (profile) => profile.id === where.id || profile.userId === where.userId,
        ) ?? null,
    },
    serviceItem: {
      findMany: async ({
        where,
      }: {
        where: {
          id?: { in: string[] };
          supplierId?: string;
          serviceDateEnd?: { lte: Date };
          payoutId?: null;
        };
      }) => {
        const ids = where.id?.in;
        if (ids) {
          return jobs.filter((row) => ids.includes(row.id)).map(withPayout);
        }
        return jobs
          .filter(
            (row) =>
              row.supplierId === where.supplierId &&
              row.serviceDateEnd <= where.serviceDateEnd!.lte &&
              row.reservation.status !== 'CANCELLED' &&
              (!('payoutId' in where) || row.payoutId === null),
          )
          .map(withPayout);
      },
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: { in: string[] }; supplierId: string };
          data: { payoutId: string; payoutStatus: string };
        }) => {
          const rows = jobs.filter(
            (row) =>
              where.id.in.includes(row.id) &&
              row.supplierId === where.supplierId &&
              row.payoutId === null &&
              row.payoutStatus !== 'SETTLED',
          );
          rows.forEach((row) => Object.assign(row, data));
          return { count: rows.length };
        },
      ),
    },
    supplierPayout: {
      create: async ({ data }: { data: Omit<Payment, 'id' | 'createdAt'> }) => {
        const row: Payment = {
          ...data,
          id: `9${payments.length}000000-0000-4000-8000-000000000000`,
          amount: new Prisma.Decimal(data.amount),
          createdAt: new Date(),
        };
        payments.push(row);
        return { id: row.id };
      },
      findMany: async ({ where }: { where: { supplierId: string } }) =>
        payments
          .filter((payment) => payment.supplierId === where.supplierId)
          .map((payment) => ({
            ...payment,
            recordedBy: payment.recordedById
              ? { fullName: 'Marta Ops', email: OPS.email }
              : null,
            _count: {
              serviceItems: jobs.filter((row) => row.payoutId === payment.id).length,
            },
          })),
      findFirst: async ({ where }: { where: { id: string; supplierId: string } }) => {
        const payment = payments.find(
          (row) => row.id === where.id && row.supplierId === where.supplierId,
        );
        if (!payment) return null;
        return {
          ...payment,
          supplier: profiles.find((profile) => profile.id === payment.supplierId),
          serviceItems: jobs.filter((row) => row.payoutId === payment.id),
        };
      },
    },
    auditLog: { create: vi.fn(async () => ({})) },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(fake),
  };
  return fake;
}

const fakeAuthService = {
  getSession: async (headers: Record<string, string | string[] | undefined>) => {
    const user = [OPS, WORKER, PEER].find(
      (candidate) => candidate.email === headers['x-test-user'],
    );
    return user
      ? {
          user: { id: user.id, email: user.email, role: user.role },
          session: { id: 'session-1', userId: user.id, expiresAt: new Date() },
        }
      : null;
  },
};

describe('worker payouts (W-Earnings, docs/schema-w-earnings.md)', () => {
  let app: INestApplication;
  let jobs: Job[];
  let payments: Payment[];
  let fakePrisma: ReturnType<typeof createFakePrisma>;
  const rendered: string[] = [];

  beforeEach(async () => {
    rendered.length = 0;
    jobs = [
      job('a0000000-0000-4000-8000-000000000001', {
        payoutRate: new Prisma.Decimal('90.10'),
      }),
      job('a0000000-0000-4000-8000-000000000002', {
        payoutRate: new Prisma.Decimal('25.20'),
        payoutStatus: 'FAILED',
      }),
      // Not yet ended, on a cancelled booking, and another worker's.
      job('a0000000-0000-4000-8000-000000000003', {
        serviceDateEnd: new Date(Date.now() + DAY_MS),
      }),
      job('a0000000-0000-4000-8000-000000000004', {
        reservation: { status: 'CANCELLED', bookingCode: 'VXCANCEL' },
      }),
      job('a0000000-0000-4000-8000-000000000005', { supplierId: PEER_ID }),
    ];
    payments = [];
    fakePrisma = createFakePrisma(jobs, payments);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(withNoSettingsVersion(fakePrisma))
      .overrideProvider(AuthService)
      .useValue(fakeAuthService)
      .overrideProvider(DOCUMENT_RENDERER)
      .useValue({
        render: async (html: string) => {
          rendered.push(html);
          return Buffer.from('%PDF-1.4 fake');
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const today = () => workerToday(new Date());

  it('offers the finished, unpaid jobs of this worker, a failed payout included', async () => {
    const response = await request(server())
      .get(`/suppliers/${DRIVER_ID}/payouts`)
      .set('x-test-user', OPS.email);

    expect(response.status).toBe(200);
    expect(
      response.body.payable.map((row: { payout: string; payoutState: string }) => [
        row.payout,
        row.payoutState,
      ]),
    ).toEqual([
      ['90.10', 'PENDING'],
      ['25.20', 'ISSUE'],
    ]);
    expect(response.body.payments).toEqual([]);
  });

  it('records a payment: the API sums the amount, settles the jobs and audits it', async () => {
    const response = await request(server())
      .post(`/suppliers/${DRIVER_ID}/payouts`)
      .set('x-test-user', OPS.email)
      .send({
        serviceItemIds: [
          'a0000000-0000-4000-8000-000000000001',
          'a0000000-0000-4000-8000-000000000002',
        ],
        method: 'CASH_OFFICE',
        paidAt: today(),
        amount: '1.00',
      });

    expect(response.status).toBe(201);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      supplierId: DRIVER_ID,
      method: 'CASH_OFFICE',
      currency: 'EUR',
      recordedById: OPS.id,
      paidAt: new Date(`${today()}T00:00:00Z`),
    });
    expect(payments[0]!.amount.toFixed(2)).toBe('115.30');
    expect(jobs.slice(0, 2).map((row) => [row.payoutStatus, row.payoutId])).toEqual([
      ['SETTLED', payments[0]!.id],
      ['SETTLED', payments[0]!.id],
    ]);
    expect(fakePrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: OPS.id,
        action: 'supplier.payout_recorded',
        entityId: DRIVER_ID,
        metadata: expect.objectContaining({ amount: '115.30', paidAt: today() }),
      }),
    });
    expect(response.body.payable).toEqual([]);
    expect(response.body.payments).toEqual([
      expect.objectContaining({
        amount: '115.30',
        paidAt: today(),
        jobs: 2,
        recordedBy: 'Marta Ops',
      }),
    ]);
  });

  it.each([
    ['a0000000-0000-4000-8000-000000000003', 'has not finished'],
    ['a0000000-0000-4000-8000-000000000004', 'cancelled booking'],
    ['a0000000-0000-4000-8000-000000000005', "not this worker's"],
    ['a0000000-0000-4000-8000-000000000099', "not this worker's"],
  ])('refuses job %s (%s) and records nothing', async (id, message) => {
    const response = await request(server())
      .post(`/suppliers/${DRIVER_ID}/payouts`)
      .set('x-test-user', OPS.email)
      .send({ serviceItemIds: [id], method: 'CASH_OFFICE', paidAt: today() });

    expect(response.status).toBe(422);
    expect(response.body.message).toContain(message);
    expect(payments).toEqual([]);
    expect(fakePrisma.serviceItem.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a day paid after today', async () => {
    const tomorrow = new Date(Date.now() + 2 * DAY_MS).toISOString().slice(0, 10);
    const response = await request(server())
      .post(`/suppliers/${DRIVER_ID}/payouts`)
      .set('x-test-user', OPS.email)
      .send({
        serviceItemIds: ['a0000000-0000-4000-8000-000000000001'],
        method: 'CASH_OFFICE',
        paidAt: tomorrow,
      });

    expect(response.status).toBe(422);
  });

  it('answers 409, without auditing, when a job was paid between the read and the write', async () => {
    fakePrisma.serviceItem.updateMany.mockResolvedValueOnce({ count: 0 });
    const response = await request(server())
      .post(`/suppliers/${DRIVER_ID}/payouts`)
      .set('x-test-user', OPS.email)
      .send({
        serviceItemIds: ['a0000000-0000-4000-8000-000000000001'],
        method: 'CASH_OFFICE',
        paidAt: today(),
      });

    expect(response.status).toBe(409);
    expect(fakePrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('prints the receipt for the desk and for the worker, and only their own', async () => {
    await request(server())
      .post(`/suppliers/${DRIVER_ID}/payouts`)
      .set('x-test-user', OPS.email)
      .send({
        serviceItemIds: ['a0000000-0000-4000-8000-000000000001'],
        method: 'CASH_OFFICE',
        paidAt: today(),
      });
    const id = payments[0]!.id;

    const desk = await request(server())
      .get(`/suppliers/${DRIVER_ID}/payouts/${id}/receipt`)
      .set('x-test-user', OPS.email);
    expect(desk.status).toBe(200);
    expect(desk.headers['content-type']).toBe('application/pdf');
    expect(desk.headers['cache-control']).toBe('no-store');
    expect(desk.headers['content-disposition']).toContain(`recibo-PG-${id.slice(0, 8)}`);
    expect(rendered[0]).toContain('Reinier Soto');
    expect(rendered[0]).toContain('90.10 EUR');
    expect(rendered[0]).toContain('oficina Vedado');

    const own = await request(server())
      .get(`/worker/payouts/${id}/receipt`)
      .set('x-test-user', WORKER.email);
    expect(own.status).toBe(200);

    const peer = await request(server())
      .get(`/worker/payouts/${id}/receipt`)
      .set('x-test-user', PEER.email);
    expect(peer.status).toBe(404);

    const wrongSupplier = await request(server())
      .get(`/suppliers/${PEER_ID}/payouts/${id}/receipt`)
      .set('x-test-user', OPS.email);
    expect(wrongSupplier.status).toBe(404);
  });
});

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, type PaymentReceipt, type Reservation } from '@ota/db';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DocumentsService } from '../src/documents/documents.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { withNoSettingsVersion } from './fixtures/operating-settings';

const SUPER_ADMIN = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@example.test',
  role: 'SUPER_ADMIN',
};
const TRAVELER = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'traveler@example.test',
  role: 'TRAVELER',
};

const RESERVATION_ID = '33333333-3333-4333-8333-333333333333';
const PAYMENT_ID = '77777777-7777-4777-8777-777777777777';

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: RESERVATION_ID,
    userId: TRAVELER.id,
    bookingCode: 'PAY00001',
    startDate: new Date('2026-11-01T00:00:00Z'),
    endDate: new Date('2026-11-05T00:00:00Z'),
    status: 'SECURED_AND_INVOICED',
    tourismCategory: 'GENERAL',
    totalCurrency: 'EUR',
    totalAmount: new Prisma.Decimal('321.00'),
    customItineraryPayload: null,
    createdAt: new Date('2026-09-20T10:00:00Z'),
    updatedAt: new Date('2026-09-20T10:00:00Z'),
    ...overrides,
  };
}

function makeReceipt(overrides: Partial<PaymentReceipt> = {}): PaymentReceipt {
  return {
    id: PAYMENT_ID,
    reservationId: RESERVATION_ID,
    gatewayTxId: 'mock_existing',
    rail: 'CARD',
    currency: 'EUR',
    amount: new Prisma.Decimal('321.00'),
    feeAmount: new Prisma.Decimal('0'),
    instalmentId: null,
    status: 'PENDING',
    payoutStatus: 'ACCRUED',
    createdAt: new Date('2026-09-20T11:00:00Z'),
    updatedAt: new Date('2026-09-20T11:00:00Z'),
    ...overrides,
  };
}

interface GateTraveler {
  id: string;
  usPerson: boolean | null;
  nationality: string | null;
}

interface FakeInstalment {
  id: string;
  reservationId: string;
  kind: string;
  position: number;
  amount: number;
  dueAt: Date;
  status: string;
}

function createFakePrisma(state: {
  reservations: Map<string, Reservation>;
  receipts: Map<string, PaymentReceipt>;
  audits: { action: string }[];
  travelers?: GateTraveler[];
  affidavits?: { travelerId: string }[];
  instalments?: FakeInstalment[];
}) {
  const instalments = () => (state.instalments ??= []);
  const fake = {
    // M3: the OFAC gate reads the party and its affidavits.
    reservationTraveler: { findMany: async () => state.travelers ?? [] },
    travelerAffidavit: { findMany: async () => state.affidavits ?? [] },
    reservation: {
      // M4: a payment link reads the schedule and the package's deposit plan.
      findUnique: async (args: { where: { id: string }; include?: unknown }) => {
        const row = state.reservations.get(args.where.id);
        if (!row) return null;
        return args.include
          ? {
              ...row,
              instalments: instalments()
                .filter((instalment) => instalment.reservationId === row.id)
                .sort((a, b) => a.position - b.position),
              package: null,
            }
          : row;
      },
      update: async (args: {
        where: { id: string };
        data: { status: Reservation['status'] };
      }) => {
        const existing = state.reservations.get(args.where.id);
        if (!existing) throw new Error('not found');
        const updated = { ...existing, status: args.data.status };
        state.reservations.set(args.where.id, updated);
        return updated;
      },
    },
    paymentReceipt: {
      findUnique: async (args: { where: { id: string } }) =>
        state.receipts.get(args.where.id) ?? null,
      findFirst: async (args: { where: { gatewayTxId?: string } }) => {
        const receipt = [...state.receipts.values()].find(
          (row) => row.gatewayTxId === args.where.gatewayTxId,
        );
        return receipt ? { ...receipt, reservation: { bookingCode: 'PAY00001' } } : null;
      },
      findMany: async (args: {
        where: { reservationId?: string; status?: string };
        include?: unknown;
      }) =>
        [...state.receipts.values()]
          .filter(
            (receipt) =>
              (args.where.reservationId === undefined ||
                receipt.reservationId === args.where.reservationId) &&
              (args.where.status === undefined || receipt.status === args.where.status),
          )
          .map((receipt) =>
            args.include
              ? { ...receipt, reservation: { bookingCode: 'PAY00001' } }
              : receipt,
          ),
      create: async (args: { data: Partial<PaymentReceipt> }) => {
        const receipt = { ...makeReceipt(), ...args.data } as PaymentReceipt;
        state.receipts.set(receipt.id, receipt);
        return receipt;
      },
      update: async (args: { where: { id: string }; data: Partial<PaymentReceipt> }) => {
        const existing = state.receipts.get(args.where.id);
        if (!existing) throw new Error('not found');
        const updated = { ...existing, ...args.data };
        state.receipts.set(args.where.id, updated);
        return updated;
      },
    },
    paymentInstalment: {
      createMany: async (args: { data: FakeInstalment[] }) => {
        instalments().push(...args.data.map((row) => ({ ...row, status: 'DUE' })));
        return { count: args.data.length };
      },
      update: async (args: { where: { id: string }; data: Partial<FakeInstalment> }) => {
        const row = instalments().find((instalment) => instalment.id === args.where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, args.data);
        return row;
      },
    },
    auditLog: {
      create: async (args: { data: { action: string } }) => {
        state.audits.push({ action: args.data.action });
        return args.data;
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(fake),
  };

  return fake;
}

const fakeAuthService = {
  getSession: async (headers: Record<string, string | string[] | undefined>) => {
    const email = headers['x-test-user'];
    const user = [SUPER_ADMIN, TRAVELER].find((candidate) => candidate.email === email);
    if (!user) {
      return null;
    }
    return {
      user: { id: user.id, email: user.email, role: user.role },
      session: { id: 'session-1', userId: user.id, expiresAt: new Date() },
    };
  },
};

describe('payments API', () => {
  let app: INestApplication;
  let state: {
    reservations: Map<string, Reservation>;
    receipts: Map<string, PaymentReceipt>;
    audits: { action: string }[];
    travelers?: GateTraveler[];
    affidavits?: { travelerId: string }[];
  };

  beforeEach(async () => {
    state = {
      reservations: new Map([[RESERVATION_ID, makeReservation()]]),
      receipts: new Map(),
      audits: [],
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(withNoSettingsVersion(createFakePrisma(state)))
      .overrideProvider(AuthService)
      .useValue(fakeAuthService)
      // Documents are exercised elsewhere; override so CONFIRMED does not try
      // to render PDFs against the fake database.
      .overrideProvider(DocumentsService)
      .useValue({ generate: async () => undefined })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function createIntent() {
    return request(app.getHttpServer())
      .post(`/reservations/${RESERVATION_ID}/payments`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ rail: 'CARD' });
  }

  it('creates a payment link and moves the booking to PENDING_PAYMENT', async () => {
    const response = await createIntent();

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      reservationId: RESERVATION_ID,
      rail: 'CARD',
      amount: '321',
      currency: 'EUR',
      status: 'PENDING',
    });
    expect(response.body.checkoutUrl).toContain('/checkout/mock/mock_');
    expect(state.reservations.get(RESERVATION_ID)?.status).toBe('PENDING_PAYMENT');
    expect(state.audits.map((entry) => entry.action)).toContain('payment.intent_created');
  });

  it('keeps payment locked until every US traveler has certified (OFAC, M3)', async () => {
    state.travelers = [
      { id: '77777777-7777-4777-8777-777777777777', usPerson: null, nationality: 'US' },
      { id: '78787878-7878-4878-8878-787878787878', usPerson: null, nationality: 'CA' },
    ];

    const locked = await createIntent();
    expect(locked.status).toBe(409);
    expect(locked.body.message).toContain('OFAC');
    expect(state.reservations.get(RESERVATION_ID)?.status).toBe('SECURED_AND_INVOICED');

    state.affidavits = [{ travelerId: '77777777-7777-4777-8777-777777777777' }];
    expect((await createIntent()).status).toBe(201);
  });

  it('confirms a pending payment and moves the booking to CONFIRMED', async () => {
    const intent = await createIntent();

    const response = await request(app.getHttpServer())
      .post(`/reservations/${RESERVATION_ID}/payments/${intent.body.id}/confirm`)
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('CONFIRMED');
    expect(state.reservations.get(RESERVATION_ID)?.status).toBe('CONFIRMED');
    expect([...state.receipts.values()][0]?.status).toBe('PAID');
    expect(state.audits.map((entry) => entry.action)).toContain('payment.confirmed');
  });

  it('lists payment receipts for a reservation', async () => {
    await createIntent();

    const response = await request(app.getHttpServer())
      .get(`/reservations/${RESERVATION_ID}/payments`)
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].rail).toBe('CARD');
  });

  it('looks up a payment intent by reference without a session', async () => {
    await createIntent();
    const reference = [...state.receipts.values()][0]?.gatewayTxId;
    expect(reference).toBeTruthy();

    const response = await request(app.getHttpServer()).get(
      `/payments/intents/${reference}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      reference: 'PAY00001',
      rail: 'CARD',
      amount: '321',
      currency: 'EUR',
      status: 'PENDING',
    });
  });

  it('returns 404 for an unknown intent reference', async () => {
    const response = await request(app.getHttpServer()).get(
      '/payments/intents/does-not-exist',
    );

    expect(response.status).toBe(404);
  });

  it('rejects a payment link before the booking is secured', async () => {
    state.reservations.set(RESERVATION_ID, makeReservation({ status: 'DRAFT' }));

    const response = await createIntent();

    expect(response.status).toBe(409);
  });

  it('rejects confirming an already-paid receipt', async () => {
    state.receipts.set(PAYMENT_ID, makeReceipt({ status: 'PAID' }));

    const response = await request(app.getHttpServer())
      .post(`/reservations/${RESERVATION_ID}/payments/${PAYMENT_ID}/confirm`)
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(409);
  });

  it('returns 404 for an unknown reservation', async () => {
    const response = await request(app.getHttpServer())
      .get('/reservations/44444444-4444-4444-8444-444444444444/payments')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(404);
  });

  it('returns 403 for a traveler', async () => {
    const response = await request(app.getHttpServer())
      .post(`/reservations/${RESERVATION_ID}/payments`)
      .set('x-test-user', TRAVELER.email)
      .send({ rail: 'CARD' });

    expect(response.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await request(app.getHttpServer()).get(
      `/reservations/${RESERVATION_ID}/payments`,
    );

    expect(response.status).toBe(401);
  });

  it('lists the ledger across bookings with their codes, filtered by status', async () => {
    state.receipts.set(PAYMENT_ID, makeReceipt({ status: 'PAID' }));
    state.receipts.set(
      '88888888-8888-4888-8888-888888888888',
      makeReceipt({
        id: '88888888-8888-4888-8888-888888888888',
        status: 'PENDING',
      }),
    );

    const all = await request(app.getHttpServer())
      .get('/payments')
      .set('x-test-user', SUPER_ADMIN.email);
    expect(all.status).toBe(200);
    expect(all.body).toHaveLength(2);
    expect(all.body[0]).toMatchObject({ bookingCode: 'PAY00001', amount: '321' });

    const paid = await request(app.getHttpServer())
      .get('/payments?status=PAID')
      .set('x-test-user', SUPER_ADMIN.email);
    expect(paid.body.map((entry: { id: string }) => entry.id)).toEqual([PAYMENT_ID]);

    const traveler = await request(app.getHttpServer())
      .get('/payments')
      .set('x-test-user', TRAVELER.email);
    expect(traveler.status).toBe(403);
  });
});

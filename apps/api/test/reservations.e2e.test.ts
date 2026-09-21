import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, type Reservation } from '@ota/db';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

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

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: RESERVATION_ID,
    userId: TRAVELER.id,
    bookingCode: 'ABC12345',
    startDate: new Date('2026-11-01T00:00:00Z'),
    endDate: new Date('2026-11-05T00:00:00Z'),
    status: 'DRAFT',
    totalCurrency: 'EUR',
    totalAmount: new Prisma.Decimal('250.00'),
    customItineraryPayload: null,
    createdAt: new Date('2026-09-20T10:00:00Z'),
    updatedAt: new Date('2026-09-20T10:00:00Z'),
    ...overrides,
  };
}

function createFakePrisma(store: Map<string, Reservation>) {
  const fake = {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) =>
        [SUPER_ADMIN, TRAVELER].find((user) => user.email === where.email) ?? null,
    },
    reservation: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.get(where.id) ?? null,
      findMany: async ({
        where,
        take,
      }: {
        where?: { status?: Reservation['status'] };
        take?: number;
      }) => {
        let rows = [...store.values()];
        if (where?.status) {
          rows = rows.filter((reservation) => reservation.status === where.status);
        }
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return take ? rows.slice(0, take) : rows;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: Reservation['status'] };
      }) => {
        const existing = store.get(where.id);
        if (!existing) {
          throw new Error(`Reservation ${where.id} not found`);
        }
        const updated: Reservation = { ...existing, status: data.status };
        store.set(where.id, updated);
        return updated;
      },
    },
    auditLog: {
      create: async () => ({}),
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(fake),
  };

  return fake;
}

// Stands in for Better Auth: maps a test header to a session, so the guard and
// RBAC can be exercised without a database or the real auth backend.
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

describe('POST /reservations/:id/transition', () => {
  let app: INestApplication;
  let store: Map<string, Reservation>;

  beforeEach(async () => {
    store = new Map([[RESERVATION_ID, makeReservation()]]);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma(store))
      .overrideProvider(AuthService)
      .useValue(fakeAuthService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('applies a legal transition for an operations admin', async () => {
    const response = await request(app.getHttpServer())
      .post(`/reservations/${RESERVATION_ID}/transition`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ to: 'ITINERARY_SUBMITTED' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ITINERARY_SUBMITTED');
    expect(store.get(RESERVATION_ID)?.status).toBe('ITINERARY_SUBMITTED');
  });

  it('rejects an illegal transition with 409', async () => {
    store.set(RESERVATION_ID, makeReservation({ status: 'COMPLETED' }));

    const response = await request(app.getHttpServer())
      .post(`/reservations/${RESERVATION_ID}/transition`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ to: 'CONFIRMED' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('InvalidReservationTransitionError');
  });

  it('returns 404 for an unknown reservation', async () => {
    const response = await request(app.getHttpServer())
      .post('/reservations/44444444-4444-4444-8444-444444444444/transition')
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ to: 'ITINERARY_SUBMITTED' });

    expect(response.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await request(app.getHttpServer())
      .post(`/reservations/${RESERVATION_ID}/transition`)
      .send({ to: 'ITINERARY_SUBMITTED' });

    expect(response.status).toBe(401);
  });

  it('returns 403 for a role without permission', async () => {
    const response = await request(app.getHttpServer())
      .post(`/reservations/${RESERVATION_ID}/transition`)
      .set('x-test-user', TRAVELER.email)
      .send({ to: 'ITINERARY_SUBMITTED' });

    expect(response.status).toBe(403);
  });

  it('returns 400 for an invalid status', async () => {
    const response = await request(app.getHttpServer())
      .post(`/reservations/${RESERVATION_ID}/transition`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ to: 'MADE_UP' });

    expect(response.status).toBe(400);
  });
});

describe('GET /reservations', () => {
  const OLDER_ID = '55555555-5555-4555-8555-555555555555';
  let app: INestApplication;
  let store: Map<string, Reservation>;

  beforeEach(async () => {
    store = new Map([
      [RESERVATION_ID, makeReservation({ createdAt: new Date('2026-09-21T10:00:00Z') })],
      [
        OLDER_ID,
        makeReservation({
          id: OLDER_ID,
          bookingCode: 'OLD00001',
          status: 'CONFIRMED',
          createdAt: new Date('2026-09-01T10:00:00Z'),
        }),
      ],
    ]);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma(store))
      .overrideProvider(AuthService)
      .useValue(fakeAuthService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the pipeline newest-first for an operations admin', async () => {
    const response = await request(app.getHttpServer())
      .get('/reservations')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body.map((reservation: { id: string }) => reservation.id)).toEqual([
      RESERVATION_ID,
      OLDER_ID,
    ]);
  });

  it('filters by status', async () => {
    const response = await request(app.getHttpServer())
      .get('/reservations?status=CONFIRMED')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].bookingCode).toBe('OLD00001');
  });

  it('rejects an unknown status filter with 400', async () => {
    const response = await request(app.getHttpServer())
      .get('/reservations?status=MADE_UP')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await request(app.getHttpServer()).get('/reservations');

    expect(response.status).toBe(401);
  });

  it('returns 403 for a traveler', async () => {
    const response = await request(app.getHttpServer())
      .get('/reservations')
      .set('x-test-user', TRAVELER.email);

    expect(response.status).toBe(403);
  });
});

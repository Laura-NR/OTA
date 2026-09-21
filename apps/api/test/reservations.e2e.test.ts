import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, type Reservation } from '@ota/db';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

interface FakeUser {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
}

interface FakeAudit {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: Date;
}

const SUPER_ADMIN: FakeUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@example.test',
  fullName: 'Platform Super Admin',
  role: 'SUPER_ADMIN',
};
const TRAVELER: FakeUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'traveler@example.test',
  fullName: 'Example Traveler',
  role: 'TRAVELER',
};
const RESERVATION_ID = '33333333-3333-4333-8333-333333333333';
const OLDER_ID = '55555555-5555-4555-8555-555555555555';

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

interface FindUniqueArgs {
  where: { id?: string; bookingCode?: string; email?: string };
  select?: unknown;
  include?: unknown;
}
interface FindManyArgs {
  where?: { status?: Reservation['status'] };
  take?: number;
  include?: unknown;
}
interface CreateArgs {
  data: {
    userId: string;
    bookingCode: string;
    startDate: Date;
    endDate: Date;
    status: Reservation['status'];
    totalCurrency: string;
    totalAmount: Prisma.Decimal.Value;
    customItineraryPayload?: Prisma.InputJsonValue;
  };
}
interface AuditFindManyArgs {
  where: { entityType: string; entityId?: string | null };
  include?: { actor?: unknown };
}
interface AuditCreateArgs {
  data: {
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata?: Prisma.InputJsonValue;
  };
}

function createFakePrisma(state: {
  reservations: Map<string, Reservation>;
  users: FakeUser[];
  audits: FakeAudit[];
  counter: { value: number };
}) {
  const withRelations = (reservation: Reservation) => ({
    ...reservation,
    user: state.users.find((user) => user.id === reservation.userId) ?? null,
    serviceItems: [],
    _count: { serviceItems: 0 },
  });

  const fake = {
    user: {
      findUnique: async (args: FindUniqueArgs) =>
        state.users.find((user) =>
          args.where.id ? user.id === args.where.id : user.email === args.where.email,
        ) ?? null,
    },
    reservation: {
      findUnique: async (args: FindUniqueArgs) => {
        const reservation = args.where.id
          ? state.reservations.get(args.where.id)
          : [...state.reservations.values()].find(
              (row) => row.bookingCode === args.where.bookingCode,
            );
        if (!reservation) return null;
        if (args.select) return { id: reservation.id };
        return args.include ? withRelations(reservation) : reservation;
      },
      findMany: async (args: FindManyArgs) => {
        let rows = [...state.reservations.values()];
        if (args.where?.status) {
          rows = rows.filter((row) => row.status === args.where?.status);
        }
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (args.take) rows = rows.slice(0, args.take);
        return args.include ? rows.map(withRelations) : rows;
      },
      update: async (args: {
        where: { id: string };
        data: { status: Reservation['status'] };
      }) => {
        const existing = state.reservations.get(args.where.id);
        if (!existing) throw new Error(`Reservation ${args.where.id} not found`);
        const updated: Reservation = { ...existing, status: args.data.status };
        state.reservations.set(args.where.id, updated);
        return updated;
      },
      create: async (args: CreateArgs) => {
        state.counter.value += 1;
        const reservation: Reservation = {
          id: `99999999-9999-4999-8999-${String(state.counter.value).padStart(12, '0')}`,
          userId: args.data.userId,
          bookingCode: args.data.bookingCode,
          startDate: args.data.startDate,
          endDate: args.data.endDate,
          status: args.data.status,
          totalCurrency: args.data.totalCurrency,
          totalAmount: new Prisma.Decimal(args.data.totalAmount),
          customItineraryPayload: args.data.customItineraryPayload ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.reservations.set(reservation.id, reservation);
        return reservation;
      },
    },
    auditLog: {
      create: async (args: AuditCreateArgs) => {
        state.counter.value += 1;
        const entry: FakeAudit = {
          id: `88888888-8888-4888-8888-${String(state.counter.value).padStart(12, '0')}`,
          actorUserId: args.data.actorUserId,
          action: args.data.action,
          entityType: args.data.entityType,
          entityId: args.data.entityId,
          metadata: args.data.metadata ?? null,
          createdAt: new Date(),
        };
        state.audits.push(entry);
        return entry;
      },
      findMany: async (args: AuditFindManyArgs) => {
        const rows = state.audits.filter(
          (entry) =>
            entry.entityType === args.where.entityType &&
            entry.entityId === args.where.entityId,
        );
        return args.include?.actor
          ? rows.map((entry) => ({
              ...entry,
              actor: state.users.find((user) => user.id === entry.actorUserId) ?? null,
            }))
          : rows;
      },
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

describe('reservations API', () => {
  let app: INestApplication;
  let state: {
    reservations: Map<string, Reservation>;
    users: FakeUser[];
    audits: FakeAudit[];
    counter: { value: number };
  };

  beforeEach(async () => {
    state = {
      reservations: new Map([[RESERVATION_ID, makeReservation()]]),
      users: [SUPER_ADMIN, TRAVELER],
      audits: [],
      counter: { value: 0 },
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma(state))
      .overrideProvider(AuthService)
      .useValue(fakeAuthService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /reservations/:id/transition', () => {
    it('applies a legal transition for an operations admin', async () => {
      const response = await request(app.getHttpServer())
        .post(`/reservations/${RESERVATION_ID}/transition`)
        .set('x-test-user', SUPER_ADMIN.email)
        .send({ to: 'ITINERARY_SUBMITTED' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ITINERARY_SUBMITTED');
      expect(state.reservations.get(RESERVATION_ID)?.status).toBe('ITINERARY_SUBMITTED');
    });

    it('rejects an illegal transition with 409', async () => {
      state.reservations.set(RESERVATION_ID, makeReservation({ status: 'COMPLETED' }));

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
    beforeEach(() => {
      state.reservations.set(
        OLDER_ID,
        makeReservation({
          id: OLDER_ID,
          bookingCode: 'OLD00001',
          status: 'CONFIRMED',
          createdAt: new Date('2026-09-01T10:00:00Z'),
        }),
      );
    });

    it('returns the pipeline newest-first with traveler context', async () => {
      const response = await request(app.getHttpServer())
        .get('/reservations')
        .set('x-test-user', SUPER_ADMIN.email);

      expect(response.status).toBe(200);
      expect(response.body.map((row: { id: string }) => row.id)).toEqual([
        RESERVATION_ID,
        OLDER_ID,
      ]);
      expect(response.body[0].travelerEmail).toBe(TRAVELER.email);
      expect(response.body[0].serviceItemCount).toBe(0);
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

  describe('GET /reservations/:id', () => {
    it('returns the detail with traveler and service items', async () => {
      const response = await request(app.getHttpServer())
        .get(`/reservations/${RESERVATION_ID}`)
        .set('x-test-user', SUPER_ADMIN.email);

      expect(response.status).toBe(200);
      expect(response.body.bookingCode).toBe('ABC12345');
      expect(response.body.travelerEmail).toBe(TRAVELER.email);
      expect(response.body.serviceItems).toEqual([]);
    });

    it('returns 404 for an unknown reservation', async () => {
      const response = await request(app.getHttpServer())
        .get('/reservations/44444444-4444-4444-8444-444444444444')
        .set('x-test-user', SUPER_ADMIN.email);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /reservations/:id/audit', () => {
    it('returns the audit trail with the actor email', async () => {
      await request(app.getHttpServer())
        .post(`/reservations/${RESERVATION_ID}/transition`)
        .set('x-test-user', SUPER_ADMIN.email)
        .send({ to: 'ITINERARY_SUBMITTED' });

      const response = await request(app.getHttpServer())
        .get(`/reservations/${RESERVATION_ID}/audit`)
        .set('x-test-user', SUPER_ADMIN.email);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].action).toBe('reservation.transition');
      expect(response.body[0].actorEmail).toBe(SUPER_ADMIN.email);
    });
  });

  describe('POST /reservations', () => {
    it('creates a DRAFT booking and records it in the audit log', async () => {
      const response = await request(app.getHttpServer())
        .post('/reservations')
        .set('x-test-user', SUPER_ADMIN.email)
        .send({
          travelerEmail: TRAVELER.email,
          startDate: '2026-12-01',
          endDate: '2026-12-07',
          totalCurrency: 'EUR',
          totalAmount: 480,
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('DRAFT');
      expect(response.body.bookingCode).toMatch(/^[A-Z2-9]{8}$/);

      const audit = await request(app.getHttpServer())
        .get(`/reservations/${response.body.id}/audit`)
        .set('x-test-user', SUPER_ADMIN.email);
      expect(
        audit.body.some(
          (entry: { action: string }) => entry.action === 'reservation.created',
        ),
      ).toBe(true);
    });

    it('returns 404 for an unknown traveler', async () => {
      const response = await request(app.getHttpServer())
        .post('/reservations')
        .set('x-test-user', SUPER_ADMIN.email)
        .send({
          travelerEmail: 'nobody@example.test',
          startDate: '2026-12-01',
          endDate: '2026-12-07',
        });

      expect(response.status).toBe(404);
    });

    it('rejects an inverted date range with 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/reservations')
        .set('x-test-user', SUPER_ADMIN.email)
        .send({
          travelerEmail: TRAVELER.email,
          startDate: '2026-12-07',
          endDate: '2026-12-01',
        });

      expect(response.status).toBe(400);
    });

    it('returns 403 for an administrative-support role', async () => {
      const response = await request(app.getHttpServer())
        .post('/reservations')
        .set('x-test-user', TRAVELER.email)
        .send({
          travelerEmail: TRAVELER.email,
          startDate: '2026-12-01',
          endDate: '2026-12-07',
        });

      expect(response.status).toBe(403);
    });
  });
});

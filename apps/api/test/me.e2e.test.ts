import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, type Reservation } from '@ota/db';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

const TRAVELER = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'traveler@example.test',
  fullName: 'Example Traveler',
  role: 'TRAVELER',
  locale: 'es',
};
const OTHER = {
  id: '99999999-9999-4999-8999-999999999999',
  email: 'other@example.test',
  fullName: null,
  role: 'TRAVELER',
  locale: 'en',
};
const SUPER_ADMIN = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@example.test',
  fullName: 'Platform Super Admin',
  role: 'SUPER_ADMIN',
  locale: 'es',
};

const MY_RESERVATION = '33333333-3333-4333-8333-333333333333';
const OTHER_RESERVATION = '44444444-4444-4444-8444-444444444444';
const SERVICE_ITEM = '55555555-5555-4555-8555-555555555555';
const DOCUMENT = '66666666-6666-4666-8666-666666666666';

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: MY_RESERVATION,
    userId: TRAVELER.id,
    bookingCode: 'MINE0001',
    startDate: new Date('2026-11-01T00:00:00Z'),
    endDate: new Date('2026-11-05T00:00:00Z'),
    status: 'CONFIRMED',
    totalCurrency: 'EUR',
    totalAmount: new Prisma.Decimal('321.00'),
    customItineraryPayload: null,
    createdAt: new Date('2026-09-20T10:00:00Z'),
    updatedAt: new Date('2026-09-20T10:00:00Z'),
    ...overrides,
  };
}

function createFakePrisma(state: {
  users: (typeof TRAVELER)[];
  reservations: Map<string, Reservation>;
  serviceItems: Record<string, unknown>[];
  documents: Record<string, unknown>[];
}) {
  const counts = (reservationId: string) => ({
    serviceItems: state.serviceItems.filter(
      (item) => item.reservationId === reservationId,
    ).length,
    documents: state.documents.filter((doc) => doc.reservationId === reservationId)
      .length,
  });

  return {
    user: {
      findUnique: async (args: { where: { id: string } }) =>
        state.users.find((user) => user.id === args.where.id) ?? null,
    },
    reservation: {
      findMany: async (args: { where: { userId: string } }) =>
        [...state.reservations.values()]
          .filter((row) => row.userId === args.where.userId)
          .map((row) => ({ ...row, _count: counts(row.id) })),
      findFirst: async (args: { where: { id: string; userId: string } }) => {
        const row = [...state.reservations.values()].find(
          (candidate) =>
            candidate.id === args.where.id && candidate.userId === args.where.userId,
        );
        if (!row) return null;
        return {
          ...row,
          serviceItems: state.serviceItems.filter(
            (item) => item.reservationId === row.id,
          ),
          documents: state.documents.filter((doc) => doc.reservationId === row.id),
          _count: counts(row.id),
        };
      },
    },
  };
}

const fakeAuthService = {
  getSession: async (headers: Record<string, string | string[] | undefined>) => {
    const email = headers['x-test-user'];
    const user = [SUPER_ADMIN, TRAVELER, OTHER].find(
      (candidate) => candidate.email === email,
    );
    if (!user) {
      return null;
    }
    return {
      user: { id: user.id, email: user.email, role: user.role },
      session: { id: 'session-1', userId: user.id, expiresAt: new Date() },
    };
  },
};

describe('me API', () => {
  let app: INestApplication;
  let state: Parameters<typeof createFakePrisma>[0];

  beforeEach(async () => {
    state = {
      users: [SUPER_ADMIN, TRAVELER, OTHER],
      reservations: new Map([
        [MY_RESERVATION, makeReservation()],
        [
          OTHER_RESERVATION,
          makeReservation({
            id: OTHER_RESERVATION,
            userId: OTHER.id,
            bookingCode: 'OTHER001',
          }),
        ],
      ]),
      serviceItems: [
        {
          id: SERVICE_ITEM,
          reservationId: MY_RESERVATION,
          serviceType: 'GUIDE',
          status: 'ACCEPTED',
          province: 'La Habana',
          serviceDateStart: new Date('2026-11-02T09:00:00Z'),
          serviceDateEnd: new Date('2026-11-02T13:00:00Z'),
          supplierId: null,
        },
      ],
      documents: [
        {
          id: DOCUMENT,
          reservationId: MY_RESERVATION,
          type: 'VOUCHER',
          generatedAt: new Date('2026-11-01T08:00:00Z'),
        },
      ],
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

  it('returns the signed-in profile', async () => {
    const response = await request(app.getHttpServer())
      .get('/me')
      .set('x-test-user', TRAVELER.email);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      email: TRAVELER.email,
      fullName: TRAVELER.fullName,
      role: 'TRAVELER',
      locale: 'es',
    });
  });

  it('lists only the caller reservations with counts', async () => {
    const response = await request(app.getHttpServer())
      .get('/me/reservations')
      .set('x-test-user', TRAVELER.email);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      bookingCode: 'MINE0001',
      serviceItemCount: 1,
      documentCount: 1,
    });
  });

  it('returns the caller reservation detail with documents', async () => {
    const response = await request(app.getHttpServer())
      .get(`/me/reservations/${MY_RESERVATION}`)
      .set('x-test-user', TRAVELER.email);

    expect(response.status).toBe(200);
    expect(response.body.serviceItems).toHaveLength(1);
    expect(response.body.documents).toHaveLength(1);
    expect(response.body.documents[0].type).toBe('VOUCHER');
    expect(response.body.documents[0].storageKey).toBeUndefined();
  });

  it('returns 404 for another traveler reservation', async () => {
    const response = await request(app.getHttpServer())
      .get(`/me/reservations/${OTHER_RESERVATION}`)
      .set('x-test-user', TRAVELER.email);

    expect(response.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await request(app.getHttpServer()).get('/me/reservations');

    expect(response.status).toBe(401);
  });
});

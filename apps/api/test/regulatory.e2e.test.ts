import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

function createFakePrisma() {
  const reservations = [
    {
      userId: 'traveler-a',
      tourismCategory: 'ECOTOURISM',
      user: { nationality: 'ES' },
      serviceItems: [
        {
          serviceType: 'ACCOMMODATION',
          province: 'La Habana',
          serviceDateStart: new Date('2026-10-01T00:00:00Z'),
          serviceDateEnd: new Date('2026-10-04T00:00:00Z'),
        },
      ],
    },
    {
      userId: 'traveler-a',
      tourismCategory: 'GENERAL',
      user: { nationality: 'ES' },
      serviceItems: [
        {
          serviceType: 'GUIDE',
          province: 'La Habana',
          serviceDateStart: new Date('2026-10-01T00:00:00Z'),
          serviceDateEnd: new Date('2026-10-01T00:00:00Z'),
        },
      ],
    },
    {
      userId: 'traveler-b',
      tourismCategory: 'NATURE',
      user: { nationality: 'FR' },
      serviceItems: [
        {
          serviceType: 'EXPERIENCE',
          province: 'Pinar del Río',
          serviceDateStart: new Date('2026-11-01T00:00:00Z'),
          serviceDateEnd: new Date('2026-11-02T00:00:00Z'),
        },
      ],
    },
  ];

  const paidReceipts = [
    {
      createdAt: new Date('2026-10-02T12:00:00Z'),
      rail: 'CARD',
      currency: 'EUR',
      amount: '120.00',
      reservation: { bookingCode: 'E2E1001' },
    },
    {
      createdAt: new Date('2026-10-03T12:00:00Z'),
      rail: 'OPEN_BANKING_SEPA',
      currency: 'EUR',
      amount: '80.00',
      reservation: { bookingCode: 'E2E1002' },
    },
  ];

  return {
    reservation: { findMany: async () => reservations },
    paymentReceipt: { findMany: async () => paidReceipts },
  };
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

describe('regulatory API', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma())
      .overrideProvider(AuthService)
      .useValue(fakeAuthService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reduces bookings into the MINTUR summary and ecotourism ratio', async () => {
    const response = await request(app.getHttpServer())
      .get('/analytics/regulatory')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      bookings: 3,
      travelers: 2,
      bedNights: 3,
      specialisedRatio: 0.6667,
    });
    expect(response.body.byCategory).toContainEqual({
      category: 'ECOTOURISM',
      count: 1,
      ratio: 0.3333,
    });
    expect(response.body.nationalities).toEqual([
      { nationality: 'ES', count: 2 },
      { nationality: 'FR', count: 1 },
    ]);
    expect(response.body.circuits).toEqual([
      { province: 'La Habana', count: 2 },
      { province: 'Pinar del Río', count: 1 },
    ]);
  });

  it('accepts a reporting window', async () => {
    const response = await request(app.getHttpServer())
      .get('/analytics/regulatory?from=2026-01-01&to=2026-12-31')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body.range.from).toBe('2026-01-01T00:00:00.000Z');
    expect(response.body.range.to).toBe('2026-12-31T00:00:00.000Z');
  });

  it('exports the paid ledger as CSV', async () => {
    const response = await request(app.getHttpServer())
      .get('/analytics/regulatory/fiscal-export')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    const lines = response.text.trim().split('\n');
    expect(lines[0]).toBe('booking_code,paid_at,rail,currency,amount');
    expect(lines[1]).toBe('E2E1001,2026-10-02T12:00:00.000Z,CARD,EUR,120.00');
    expect(lines[2]).toBe('E2E1002,2026-10-03T12:00:00.000Z,OPEN_BANKING_SEPA,EUR,80.00');
  });

  it('returns 403 for a traveler', async () => {
    const response = await request(app.getHttpServer())
      .get('/analytics/regulatory')
      .set('x-test-user', TRAVELER.email);

    expect(response.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await request(app.getHttpServer()).get('/analytics/regulatory');

    expect(response.status).toBe(401);
  });
});

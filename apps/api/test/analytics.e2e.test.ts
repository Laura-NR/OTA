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

const OFFERED_AT = new Date('2026-09-20T10:00:00Z');

function createFakePrisma() {
  const payments = [
    { amount: '100', rail: 'CARD', status: 'PAID', reservation: { packageId: 'pkg-1' } },
    {
      amount: '50',
      rail: 'OPEN_BANKING_SEPA',
      status: 'PAID',
      reservation: { packageId: null },
    },
    { amount: '25', rail: 'CARD', status: 'PENDING', reservation: { packageId: null } },
  ];
  const serviceItems = [
    {
      payoutRate: '30',
      payoutStatus: 'ACCRUED',
      province: 'La Habana',
      reservation: { packageId: 'pkg-1' },
    },
    {
      payoutRate: '20',
      payoutStatus: 'SETTLED',
      province: 'Matanzas',
      reservation: { packageId: null },
    },
  ];
  const offers = [
    {
      status: 'ACCEPTED',
      offeredAt: OFFERED_AT,
      respondedAt: new Date('2026-09-20T10:10:00Z'),
    },
    { status: 'TIMEOUT', offeredAt: OFFERED_AT, respondedAt: null },
  ];
  const reservations = [
    { status: 'CONFIRMED' },
    { status: 'CONFIRMED' },
    { status: 'DRAFT' },
  ];
  const reviews = [{ rating: 4 }, { rating: 5 }];

  return {
    paymentReceipt: {
      findMany: async (args: { where?: { status?: string } }) =>
        payments.filter(
          (payment) => !args.where?.status || payment.status === args.where.status,
        ),
    },
    serviceItem: { findMany: async () => serviceItems },
    dispatchOffer: { findMany: async () => offers },
    reservation: { findMany: async () => reservations },
    review: { findMany: async () => reviews },
    incident: {
      findMany: async () => [{ severity: 'HIGH', resolvedAt: null }],
    },
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

describe('analytics API', () => {
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

  it('returns the finance, operations, quality, and geography KPIs', async () => {
    const response = await request(app.getHttpServer())
      .get('/analytics/overview')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body.finance).toMatchObject({
      gbv: 150,
      payoutsAccrued: 30,
      payoutsSettled: 20,
      netRevenue: 100,
      takeRate: 0.6667,
      averageOrderValue: 75,
      paidCount: 2,
    });
    expect(response.body.finance.byRail).toEqual([
      { rail: 'CARD', amount: 100, count: 1 },
      { rail: 'OPEN_BANKING_SEPA', amount: 50, count: 1 },
    ]);
    expect(response.body.finance.byPackageType).toEqual([
      { type: 'PACKAGE', amount: 100, count: 1, netRevenue: 70, takeRate: 0.7 },
      { type: 'CUSTOM', amount: 50, count: 1, netRevenue: 30, takeRate: 0.6 },
    ]);
    expect(response.body.operations).toMatchObject({
      offers: 2,
      accepted: 1,
      timedOut: 1,
      acceptanceRate: 0.5,
      timeoutRate: 0.5,
      averageResponseMinutes: 10,
    });
    expect(response.body.quality).toEqual({
      reviewCount: 2,
      averageRating: 4.5,
      incidentCount: 1,
      openIncidentCount: 1,
      highSeverityCount: 1,
    });
    expect(response.body.geography).toEqual([
      { province: 'La Habana', count: 1 },
      { province: 'Matanzas', count: 1 },
    ]);
  });

  it('accepts a reporting window', async () => {
    const response = await request(app.getHttpServer())
      .get('/analytics/overview?from=2026-01-01&to=2026-12-31')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body.range.from).toBe('2026-01-01T00:00:00.000Z');
    expect(response.body.range.to).toBe('2026-12-31T00:00:00.000Z');
  });

  it('returns 403 for a traveler', async () => {
    const response = await request(app.getHttpServer())
      .get('/analytics/overview')
      .set('x-test-user', TRAVELER.email);

    expect(response.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await request(app.getHttpServer()).get('/analytics/overview');

    expect(response.status).toBe(401);
  });
});

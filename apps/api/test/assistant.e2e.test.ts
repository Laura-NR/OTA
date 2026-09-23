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

const RESERVATION_ID = '33333333-3333-4333-8333-333333333333';
const OFFERED_AT = new Date('2026-09-20T10:00:00Z');

function createFakePrisma() {
  return {
    reservation: {
      findUnique: async (args: { where: { id: string } }) =>
        args.where.id === RESERVATION_ID
          ? {
              id: RESERVATION_ID,
              bookingCode: 'DEMO0001',
              status: 'PENDING_PAYMENT',
              user: { fullName: 'Example Traveler', locale: 'es' },
              serviceItems: [{ serviceType: 'ACCOMMODATION', province: 'La Habana' }],
              messages: [{ body: 'Can we arrive a day earlier?' }],
            }
          : null,
      findMany: async () => [{ status: 'CONFIRMED' }, { status: 'DRAFT' }],
    },
    paymentReceipt: {
      findMany: async () => [{ amount: '100', rail: 'CARD', status: 'PAID' }],
    },
    serviceItem: {
      findMany: async () => [
        { payoutRate: '30', payoutStatus: 'ACCRUED', province: 'La Habana' },
      ],
    },
    dispatchOffer: {
      findMany: async () => [
        {
          status: 'ACCEPTED',
          offeredAt: OFFERED_AT,
          respondedAt: new Date('2026-09-20T10:10:00Z'),
        },
      ],
    },
    review: { findMany: async () => [{ rating: 5 }] },
    incident: { findMany: async () => [] },
  };
}

const fakeAuthService = {
  getSession: async (headers: Record<string, string | string[] | undefined>) => {
    const email = headers['x-test-user'];
    const user = [SUPER_ADMIN, TRAVELER].find((candidate) => candidate.email === email);
    if (!user) return null;
    return {
      user: { id: user.id, email: user.email, role: user.role },
      session: { id: 'session-1', userId: user.id, expiresAt: new Date() },
    };
  },
};

describe('assistant API', () => {
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

  it('drafts a contextual reply from the booking data', async () => {
    const response = await request(app.getHttpServer())
      .post('/assistant/draft-reply')
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ reservationId: RESERVATION_ID });

    expect(response.status).toBe(200);
    expect(response.body.subject).toContain('DEMO0001');
    expect(response.body.body).toContain('Hola Example Traveler');
    expect(response.body.body).toContain('Can we arrive a day earlier?');
  });

  it('returns 404 for an unknown reservation', async () => {
    const response = await request(app.getHttpServer())
      .post('/assistant/draft-reply')
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ reservationId: '44444444-4444-4444-8444-444444444444' });

    expect(response.status).toBe(404);
  });

  it('summarises the KPI window in natural language', async () => {
    const response = await request(app.getHttpServer())
      .get('/assistant/ops-summary?from=2026-01-01&to=2026-12-31')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body.text).toContain('2 bookings');
    expect(response.body.text).toContain('€100.00 gross');
  });

  it('translates to the requested locale via the adapter', async () => {
    const response = await request(app.getHttpServer())
      .post('/assistant/translate')
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ text: 'Your booking is confirmed', targetLocale: 'fr' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      text: '[fr] Your booking is confirmed',
      targetLocale: 'fr',
    });
  });

  it('returns 403 for a traveler', async () => {
    const response = await request(app.getHttpServer())
      .post('/assistant/draft-reply')
      .set('x-test-user', TRAVELER.email)
      .send({ reservationId: RESERVATION_ID });

    expect(response.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await request(app.getHttpServer()).get('/assistant/ops-summary');

    expect(response.status).toBe(401);
  });
});

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
      status: 'CONFIRMED',
      userId: 'user-a',
      tourismCategory: 'ECOTOURISM',
      user: { nationality: 'ES' },
      serviceItems: [
        {
          serviceType: 'ACCOMMODATION',
          province: 'La Habana',
          serviceDateStart: new Date('2026-10-01T00:00:00Z'),
          serviceDateEnd: new Date('2026-10-03T00:00:00Z'),
        },
      ],
    },
    {
      status: 'DRAFT',
      userId: 'user-b',
      tourismCategory: 'GENERAL',
      user: { nationality: null },
      serviceItems: [],
    },
  ];

  return {
    reservation: { findMany: async () => reservations },
    paymentReceipt: {
      findMany: async () => [
        {
          amount: '100',
          rail: 'CARD',
          status: 'PAID',
          reservation: { packageId: null },
        },
      ],
    },
    serviceItem: {
      findMany: async () => [
        {
          payoutRate: '30',
          payoutStatus: 'ACCRUED',
          province: 'La Habana',
          reservation: { packageId: null },
        },
      ],
    },
    dispatchOffer: { findMany: async () => [] },
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

function binaryParser(
  response: NodeJS.ReadableStream,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('reports API', () => {
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

  it('exports the BI workbook as an xlsx attachment', async () => {
    const response = await request(app.getHttpServer())
      .get('/analytics/export/xlsx?from=2026-01-01&to=2026-12-31')
      .set('x-test-user', SUPER_ADMIN.email)
      .buffer(true)
      .parse(binaryParser);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml');
    expect(response.headers['content-disposition']).toContain('ota-bi-digest');
    expect(Buffer.isBuffer(response.body)).toBe(true);
    // XLSX is a zip archive; the first bytes are the local file header.
    expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('returns 403 for a traveler', async () => {
    const response = await request(app.getHttpServer())
      .get('/analytics/export/xlsx')
      .set('x-test-user', TRAVELER.email);

    expect(response.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await request(app.getHttpServer()).get('/analytics/export/xlsx');

    expect(response.status).toBe(401);
  });
});

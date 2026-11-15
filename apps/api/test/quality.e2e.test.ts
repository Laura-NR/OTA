import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
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
const INCIDENT_ID = '55555555-5555-4555-8555-555555555555';
const REVIEW_ID = '77777777-7777-4777-8777-777777777777';
const SUPPLIER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUPPLIER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

interface FakeIncident {
  id: string;
  reservationId: string;
  category: string;
  description: string;
  severity: string;
  resolvedAt: Date | null;
  createdAt: Date;
  reservation: { bookingCode: string };
  source: string;
  serviceItemId: string | null;
  supplierId: string | null;
  latitude: { toNumber: () => number } | null;
  longitude: { toNumber: () => number } | null;
  locationAccuracyM: number | null;
  occurredAt: Date | null;
  clientRef: string | null;
  acknowledgedAt: Date | null;
  acknowledgedById: string | null;
  supplier: {
    primaryPhone: string;
    user: { fullName: string | null; email: string };
  } | null;
  acknowledgedBy: { fullName: string | null; email: string } | null;
}

const SERVICE_ITEM_ID = '88888888-8888-4888-8888-888888888888';

function makeIncident(overrides: Partial<FakeIncident> = {}): FakeIncident {
  return {
    id: INCIDENT_ID,
    reservationId: RESERVATION_ID,
    category: 'MEDICAL',
    description: 'Traveler needed a pharmacy',
    severity: 'HIGH',
    resolvedAt: null,
    createdAt: new Date('2026-09-20T10:00:00Z'),
    reservation: { bookingCode: 'E2E0001' },
    source: 'DESK',
    serviceItemId: null,
    supplierId: null,
    latitude: null,
    longitude: null,
    locationAccuracyM: null,
    occurredAt: null,
    clientRef: null,
    acknowledgedAt: null,
    acknowledgedById: null,
    supplier: null,
    acknowledgedBy: null,
    ...overrides,
  };
}

/** A driver's report from the app, waiting for the desk (W-Job J6). */
function workerReport(overrides: Partial<FakeIncident> = {}): FakeIncident {
  return makeIncident({
    id: '99999999-1111-4111-8111-111111111111',
    category: 'MEDICAL',
    description: '',
    severity: 'CRITICAL',
    source: 'WORKER_APP',
    serviceItemId: SERVICE_ITEM_ID,
    supplierId: SUPPLIER_A,
    latitude: { toNumber: () => 23.11361 },
    longitude: { toNumber: () => -82.36658 },
    locationAccuracyM: 12,
    occurredAt: new Date('2026-09-20T19:36:00Z'),
    supplier: {
      primaryPhone: '+5352410000',
      user: { fullName: 'Lázaro Pérez', email: 'l@x.test' },
    },
    ...overrides,
  });
}

function createFakePrisma(state: {
  incidents: FakeIncident[];
  offers: {
    supplierId: string;
    status: string;
    offeredAt: Date;
    respondedAt: Date | null;
  }[];
}) {
  const fake = {
    reservation: {
      findUnique: async (args: { where: { id: string } }) =>
        args.where.id === RESERVATION_ID
          ? {
              id: RESERVATION_ID,
              serviceItems: [{ id: SERVICE_ITEM_ID, supplierId: SUPPLIER_A }],
            }
          : null,
    },
    incident: {
      findMany: async (args: {
        where?: {
          reservationId?: string;
          resolvedAt?: unknown;
          acknowledgedAt?: null;
          source?: { in: string[] };
        };
      }) => {
        return state.incidents.filter((incident) => {
          const where = args.where ?? {};
          if (where.source && !where.source.in.includes(incident.source)) return false;
          if (where.acknowledgedAt === null && incident.acknowledgedAt !== null)
            return false;
          if (where.reservationId && incident.reservationId !== where.reservationId) {
            return false;
          }
          if (where.resolvedAt === null && incident.resolvedAt !== null) {
            return false;
          }
          if (
            where.resolvedAt &&
            typeof where.resolvedAt === 'object' &&
            incident.resolvedAt === null
          ) {
            return false;
          }
          return true;
        });
      },
      findUnique: async (args: { where: { id: string } }) =>
        state.incidents.find((incident) => incident.id === args.where.id) ?? null,
      findUniqueOrThrow: async (args: { where: { id: string } }) => {
        const incident = state.incidents.find((row) => row.id === args.where.id);
        if (!incident) throw new Error('not found');
        return incident;
      },
      updateMany: async (args: {
        where: { id: string; acknowledgedAt: null };
        data: { acknowledgedAt: Date; acknowledgedById: string };
      }) => {
        const incident = state.incidents.find(
          (row) => row.id === args.where.id && row.acknowledgedAt === null,
        );
        if (!incident) return { count: 0 };
        Object.assign(incident, args.data, {
          acknowledgedBy: { fullName: 'Super Admin', email: SUPER_ADMIN.email },
        });
        return { count: 1 };
      },
      create: async (args: { data: Partial<FakeIncident> }) => {
        const incident = makeIncident({ ...args.data, resolvedAt: null });
        state.incidents.push(incident);
        return incident;
      },
      update: async (args: { where: { id: string }; data: { resolvedAt: Date } }) => {
        const incident = state.incidents.find((row) => row.id === args.where.id);
        if (!incident) throw new Error('not found');
        incident.resolvedAt = args.data.resolvedAt;
        return incident;
      },
    },
    dispatchOffer: {
      findMany: async () => state.offers,
    },
    supplierProfile: {
      findMany: async () => [
        { id: SUPPLIER_A, user: { fullName: 'Guide A', email: 'a@example.test' } },
        { id: SUPPLIER_B, user: { fullName: null, email: 'b@example.test' } },
      ],
    },
    review: {
      findMany: async () => [
        {
          id: REVIEW_ID,
          reservationId: RESERVATION_ID,
          rating: 5,
          comment: 'Wonderful trip',
          createdAt: new Date('2026-09-22T10:00:00Z'),
          reservation: { bookingCode: 'E2E0001' },
        },
      ],
    },
    auditLog: { create: async () => ({}) },
  };

  return fake;
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

describe('quality API', () => {
  let app: INestApplication;
  let state: {
    incidents: FakeIncident[];
    offers: {
      supplierId: string;
      status: string;
      offeredAt: Date;
      respondedAt: Date | null;
    }[];
  };

  beforeEach(async () => {
    const offeredAt = new Date('2026-09-20T10:00:00Z');
    state = {
      incidents: [makeIncident()],
      offers: [
        {
          supplierId: SUPPLIER_A,
          status: 'ACCEPTED',
          offeredAt,
          respondedAt: new Date('2026-09-20T10:10:00Z'),
        },
        { supplierId: SUPPLIER_A, status: 'DECLINED', offeredAt, respondedAt: null },
        { supplierId: SUPPLIER_B, status: 'TIMEOUT', offeredAt, respondedAt: null },
      ],
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(withNoSettingsVersion(createFakePrisma(state)))
      .overrideProvider(AuthService)
      .useValue(fakeAuthService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists incidents with the booking code and filters by resolved', async () => {
    state.incidents.push(
      makeIncident({
        id: '66666666-6666-4666-8666-666666666666',
        resolvedAt: new Date('2026-09-21T10:00:00Z'),
      }),
    );

    const all = await request(app.getHttpServer())
      .get('/incidents')
      .set('x-test-user', SUPER_ADMIN.email);
    expect(all.status).toBe(200);
    expect(all.body).toHaveLength(2);
    expect(all.body[0].bookingCode).toBe('E2E0001');

    const open = await request(app.getHttpServer())
      .get('/incidents?resolved=false')
      .set('x-test-user', SUPER_ADMIN.email);
    expect(open.body).toHaveLength(1);
    expect(open.body[0].resolvedAt).toBeNull();
  });

  it('logs an incident against a reservation and audits it', async () => {
    const response = await request(app.getHttpServer())
      .post(`/reservations/${RESERVATION_ID}/incidents`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({
        category: 'TRANSPORT',
        description: 'Driver did not show up',
        severity: 'CRITICAL',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      reservationId: RESERVATION_ID,
      severity: 'CRITICAL',
      resolvedAt: null,
    });
    expect(state.incidents).toHaveLength(2);
  });

  it('returns 404 when logging against an unknown reservation', async () => {
    const response = await request(app.getHttpServer())
      .post('/reservations/99999999-9999-4999-8999-999999999999/incidents')
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ category: 'MEDICAL', description: 'x' });

    expect(response.status).toBe(404);
  });

  it("lists only the workers' reports still waiting for the desk (W-Job J6)", async () => {
    state.incidents.push(
      workerReport(),
      workerReport({
        id: '99999999-2222-4222-8222-222222222222',
        acknowledgedAt: new Date('2026-09-20T19:40:00Z'),
      }),
    );
    const response = await request(app.getHttpServer())
      .get('/incidents/emergencies')
      .set('x-test-user', SUPER_ADMIN.email);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      source: 'WORKER_APP',
      supplierName: 'Lázaro Pérez',
      supplierPhone: '+5352410000',
      position: { latitude: 23.11361, longitude: -82.36658, accuracyM: 12 },
      acknowledgedAt: null,
    });
  });

  it('acknowledges an emergency once; a second acknowledgement returns the first', async () => {
    state.incidents.push(workerReport());
    const first = await request(app.getHttpServer())
      .post('/incidents/99999999-1111-4111-8111-111111111111/acknowledge')
      .set('x-test-user', SUPER_ADMIN.email);
    expect(first.status).toBe(200);
    expect(first.body.acknowledgedBy).toBe('Super Admin');
    const second = await request(app.getHttpServer())
      .post('/incidents/99999999-1111-4111-8111-111111111111/acknowledge')
      .set('x-test-user', SUPER_ADMIN.email);
    expect(second.status).toBe(200);
    expect(second.body.acknowledgedAt).toBe(first.body.acknowledgedAt);
  });

  it("logs a report that came by SMS as already in hand, on one of the booking's services", async () => {
    const response = await request(app.getHttpServer())
      .post(`/reservations/${RESERVATION_ID}/incidents`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({
        category: 'MEDICAL',
        description: 'SOS por SMS, la central llamó',
        severity: 'CRITICAL',
        source: 'WORKER_SMS',
        serviceItemId: SERVICE_ITEM_ID,
      });
    expect(response.status).toBe(201);
    const logged = state.incidents.at(-1)!;
    expect(logged).toMatchObject({
      source: 'WORKER_SMS',
      serviceItemId: SERVICE_ITEM_ID,
      supplierId: SUPPLIER_A,
    });
    expect(logged.acknowledgedAt).not.toBeNull();

    const elsewhere = await request(app.getHttpServer())
      .post(`/reservations/${RESERVATION_ID}/incidents`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({
        category: 'MEDICAL',
        description: 'x',
        source: 'WORKER_SMS',
        serviceItemId: '12121212-1212-4212-8212-121212121212',
      });
    expect(elsewhere.status).toBe(422);
  });

  it('resolves an incident once and rejects a second resolve', async () => {
    const first = await request(app.getHttpServer())
      .patch(`/incidents/${INCIDENT_ID}/resolve`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ note: 'Handled by the desk' });
    expect(first.status).toBe(200);
    expect(first.body.resolvedAt).not.toBeNull();

    const second = await request(app.getHttpServer())
      .patch(`/incidents/${INCIDENT_ID}/resolve`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({});
    expect(second.status).toBe(409);
  });

  it('reduces dispatch offers into supplier reliability scorecards', async () => {
    const response = await request(app.getHttpServer())
      .get('/quality/supplier-reliability')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      supplierId: SUPPLIER_A,
      supplierName: 'Guide A',
      offers: 2,
      acceptanceRate: 0.5,
      averageResponseMinutes: 10,
    });
    expect(response.body[1]).toMatchObject({
      supplierId: SUPPLIER_B,
      supplierName: 'b@example.test',
      timeoutRate: 1,
    });
  });

  it('lists traveler reviews with the booking code', async () => {
    const response = await request(app.getHttpServer())
      .get('/reviews')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      bookingCode: 'E2E0001',
      rating: 5,
      comment: 'Wonderful trip',
    });
  });

  it('returns 403 for a traveler logging an incident', async () => {
    const response = await request(app.getHttpServer())
      .post(`/reservations/${RESERVATION_ID}/incidents`)
      .set('x-test-user', TRAVELER.email)
      .send({ category: 'MEDICAL', description: 'x' });

    expect(response.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await request(app.getHttpServer()).get('/incidents');

    expect(response.status).toBe(401);
  });
});

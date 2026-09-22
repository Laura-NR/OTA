import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { SupplierApplication, User } from '@ota/db';
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

const NEW_USER_ID = '44444444-4444-4444-8444-444444444444';

const VALID_APPLICATION = {
  fullName: 'Ana Guide',
  email: 'ana.guide@example.test',
  phone: '+53 5555 1234',
  category: 'TOUR_GUIDE',
  provincesActive: ['La Habana'],
  rtnLicenseNumber: 'RTN-ANA-001',
};

function createFakePrisma(state: {
  applications: Map<string, SupplierApplication>;
  users: User[];
  profiles: Record<string, unknown>[];
  counter: { value: number };
}) {
  const fake = {
    supplierApplication: {
      findFirst: async (args: { where: { email: string; status: string } }) =>
        [...state.applications.values()].find(
          (row) => row.email === args.where.email && row.status === args.where.status,
        ) ?? null,
      findUnique: async (args: { where: { id: string } }) =>
        state.applications.get(args.where.id) ?? null,
      findMany: async (args: { where?: { status?: string } }) => {
        let rows = [...state.applications.values()];
        if (args.where?.status) {
          rows = rows.filter((row) => row.status === args.where?.status);
        }
        return rows;
      },
      create: async (args: { data: Partial<SupplierApplication> }) => {
        state.counter.value += 1;
        const application = {
          id: `55555555-5555-4555-8555-${String(state.counter.value).padStart(12, '0')}`,
          reviewedByUserId: null,
          reviewedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.data,
        } as SupplierApplication;
        state.applications.set(application.id, application);
        return application;
      },
      update: async (args: {
        where: { id: string };
        data: Partial<SupplierApplication>;
      }) => {
        const existing = state.applications.get(args.where.id);
        if (!existing) throw new Error('not found');
        const updated = { ...existing, ...args.data };
        state.applications.set(args.where.id, updated);
        return updated;
      },
    },
    user: {
      findUnique: async (args: { where: { email?: string; id?: string } }) =>
        state.users.find(
          (user) =>
            (args.where.email && user.email === args.where.email) ||
            (args.where.id && user.id === args.where.id),
        ) ?? null,
      create: async (args: { data: Record<string, unknown> }) => {
        const user = {
          id: NEW_USER_ID,
          emailVerified: false,
          locale: 'es',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.data,
        } as unknown as User;
        state.users.push(user);
        return user;
      },
    },
    supplierProfile: {
      findUnique: async (args: {
        where: { userId?: string; rtnLicenseNumber?: string };
      }) =>
        state.profiles.find(
          (profile) =>
            (args.where.userId && profile.userId === args.where.userId) ||
            (args.where.rtnLicenseNumber &&
              profile.rtnLicenseNumber === args.where.rtnLicenseNumber),
        ) ?? null,
      create: async (args: { data: Record<string, unknown> }) => {
        state.profiles.push(args.data);
        return args.data;
      },
    },
    auditLog: {
      create: async (args: { data: unknown }) => args.data,
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

describe('supplier applications', () => {
  let app: INestApplication;
  let state: Parameters<typeof createFakePrisma>[0];

  beforeEach(async () => {
    state = {
      applications: new Map(),
      users: [],
      profiles: [],
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

  it('accepts a public application without a session', async () => {
    const response = await request(app.getHttpServer())
      .post('/supplier-applications')
      .send(VALID_APPLICATION);

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('PENDING');
    expect(state.applications.size).toBe(1);
  });

  it('rejects a duplicate pending application', async () => {
    await request(app.getHttpServer())
      .post('/supplier-applications')
      .send(VALID_APPLICATION);
    const response = await request(app.getHttpServer())
      .post('/supplier-applications')
      .send(VALID_APPLICATION);

    expect(response.status).toBe(409);
  });

  it('rejects an incomplete application with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/supplier-applications')
      .send({ ...VALID_APPLICATION, rtnLicenseNumber: '' });

    expect(response.status).toBe(400);
  });

  it('lists applications for operations and hides them from travelers', async () => {
    await request(app.getHttpServer())
      .post('/supplier-applications')
      .send(VALID_APPLICATION);

    const ops = await request(app.getHttpServer())
      .get('/supplier-applications')
      .set('x-test-user', SUPER_ADMIN.email);
    expect(ops.status).toBe(200);
    expect(ops.body).toHaveLength(1);

    const traveler = await request(app.getHttpServer())
      .get('/supplier-applications')
      .set('x-test-user', TRAVELER.email);
    expect(traveler.status).toBe(403);
  });

  it('approves an application, creating a worker user and profile', async () => {
    await request(app.getHttpServer())
      .post('/supplier-applications')
      .send(VALID_APPLICATION);
    const id = [...state.applications.keys()][0]!;

    const response = await request(app.getHttpServer())
      .post(`/supplier-applications/${id}/approve`)
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('APPROVED');
    expect(state.users).toHaveLength(1);
    expect(state.users[0]?.role).toBe('SERVICE_WORKER');
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0]).toMatchObject({
      userId: NEW_USER_ID,
      rtnLicenseNumber: VALID_APPLICATION.rtnLicenseNumber,
    });
  });

  it('rejects an application without creating an account', async () => {
    await request(app.getHttpServer())
      .post('/supplier-applications')
      .send(VALID_APPLICATION);
    const id = [...state.applications.keys()][0]!;

    const response = await request(app.getHttpServer())
      .post(`/supplier-applications/${id}/reject`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ reason: 'Licence could not be verified' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('REJECTED');
    expect(state.users).toHaveLength(0);
  });

  it('returns 404 when approving an unknown application', async () => {
    const response = await request(app.getHttpServer())
      .post('/supplier-applications/99999999-9999-4999-8999-999999999999/approve')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(404);
  });
});

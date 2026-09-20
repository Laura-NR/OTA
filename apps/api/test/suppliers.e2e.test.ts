import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { SupplierProfile } from '@ota/db';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DRIVER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeSupplier(
  overrides: Partial<SupplierProfile> & { id: string },
): SupplierProfile & { user: { email: string; fullName: string | null } } {
  return {
    userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    category: 'TOUR_GUIDE',
    primaryPhone: '+53 5555 0000',
    provincesActive: ['La Habana'],
    vehicleDetails: null,
    rtnLicenseNumber: `RTN-${overrides.id.slice(0, 4)}`,
    credentialDocumentUrl: null,
    credentialExpiresAt: null,
    verificationStatus: 'PENDING_AUDIT',
    isAvailable: true,
    createdAt: new Date('2026-09-20T10:00:00Z'),
    updatedAt: new Date('2026-09-20T10:00:00Z'),
    user: { email: 'supplier@example.test', fullName: 'Supplier Name' },
    ...overrides,
  };
}

function createFakePrisma(store: Map<string, ReturnType<typeof makeSupplier>>) {
  const fake = {
    supplierProfile: {
      findMany: async ({
        where,
      }: {
        where?: {
          verificationStatus?: string;
          provincesActive?: { has: string };
        };
      }) => {
        let rows = [...store.values()];
        if (where?.verificationStatus) {
          rows = rows.filter(
            (row) => row.verificationStatus === where.verificationStatus,
          );
        }
        if (where?.provincesActive?.has) {
          const province = where.provincesActive.has;
          rows = rows.filter((row) => row.provincesActive.includes(province));
        }
        return rows;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.get(where.id) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { verificationStatus: SupplierProfile['verificationStatus'] };
      }) => {
        const existing = store.get(where.id);
        if (!existing) {
          throw new Error(`Supplier ${where.id} not found`);
        }
        const updated = { ...existing, verificationStatus: data.verificationStatus };
        store.set(where.id, updated);
        return updated;
      },
    },
    auditLog: {
      create: vi.fn(async () => ({})),
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

describe('suppliers', () => {
  let app: INestApplication;
  let store: Map<string, ReturnType<typeof makeSupplier>>;
  let fakePrisma: ReturnType<typeof createFakePrisma>;

  beforeEach(async () => {
    store = new Map([
      [
        GUIDE_ID,
        makeSupplier({
          id: GUIDE_ID,
          verificationStatus: 'VERIFIED',
          provincesActive: ['La Habana', 'Pinar del Río'],
        }),
      ],
      [
        DRIVER_ID,
        makeSupplier({
          id: DRIVER_ID,
          category: 'PRIVATE_DRIVER',
          verificationStatus: 'PENDING_AUDIT',
          provincesActive: ['Matanzas'],
        }),
      ],
    ]);

    fakePrisma = createFakePrisma(store);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
      .overrideProvider(AuthService)
      .useValue(fakeAuthService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists suppliers for an operations admin', async () => {
    const response = await request(app.getHttpServer())
      .get('/suppliers')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
  });

  it('filters by verification status', async () => {
    const response = await request(app.getHttpServer())
      .get('/suppliers?status=VERIFIED')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].verificationStatus).toBe('VERIFIED');
  });

  it('returns 404 for an unknown supplier', async () => {
    const response = await request(app.getHttpServer())
      .get('/suppliers/99999999-9999-4999-8999-999999999999')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(404);
  });

  it('approves a supplier and records an audit entry', async () => {
    const response = await request(app.getHttpServer())
      .post(`/suppliers/${DRIVER_ID}/verification`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ status: 'VERIFIED' });

    expect(response.status).toBe(200);
    expect(response.body.verificationStatus).toBe('VERIFIED');
    expect(store.get(DRIVER_ID)?.verificationStatus).toBe('VERIFIED');
    expect(fakePrisma.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 403 for a traveler', async () => {
    const response = await request(app.getHttpServer())
      .get('/suppliers')
      .set('x-test-user', TRAVELER.email);

    expect(response.status).toBe(403);
  });

  it('returns 400 for an unknown verification status', async () => {
    const response = await request(app.getHttpServer())
      .post(`/suppliers/${DRIVER_ID}/verification`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ status: 'MADE_UP' });

    expect(response.status).toBe(400);
  });
});

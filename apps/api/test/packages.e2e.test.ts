import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@ota/db';
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

const ITEM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MISSING_ITEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PACKAGE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const INACTIVE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NEW_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

interface FakeInventoryItem {
  id: string;
  type: string;
  name: string;
  description: string | null;
  province: string | null;
  currency: string;
  basePrice: Prisma.Decimal;
  active: boolean;
  attributes: null;
  supplierId: string | null;
  createdAt: Date;
  updatedAt: Date;
  media: never[];
}

interface FakeService {
  id: string;
  packageId: string;
  inventoryItemId: string;
  dayOffset: number;
  position: number;
  createdAt: Date;
  inventoryItem: FakeInventoryItem;
}

interface FakePackage {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  province: string | null;
  durationDays: number;
  currency: string;
  basePrice: Prisma.Decimal;
  active: boolean;
  attributes: null;
  createdAt: Date;
  updatedAt: Date;
  services: FakeService[];
}

function makeInventoryItem(id: string): FakeInventoryItem {
  return {
    id,
    type: 'ACCOMMODATION',
    name: 'Casa Particular',
    description: null,
    province: 'La Habana',
    currency: 'EUR',
    basePrice: new Prisma.Decimal('90.00'),
    active: true,
    attributes: null,
    supplierId: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    media: [],
  };
}

function makePackage(overrides: Partial<FakePackage> = {}): FakePackage {
  const id = overrides.id ?? PACKAGE_ID;
  return {
    id,
    name: 'Vinales Agro-Ecology Trail',
    slug: 'vinales-agro-ecology-trail',
    description: null,
    province: 'La Habana',
    durationDays: 3,
    currency: 'EUR',
    basePrice: new Prisma.Decimal('180.00'),
    active: true,
    attributes: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    services: [
      {
        id: `${id}-s1`,
        packageId: id,
        inventoryItemId: ITEM_A,
        dayOffset: 0,
        position: 0,
        createdAt: new Date('2026-09-01T00:00:00Z'),
        inventoryItem: makeInventoryItem(ITEM_A),
      },
    ],
    ...overrides,
  };
}

function createFakePrisma(state: { packages: FakePackage[] }) {
  const fake = {
    inventoryItem: {
      count: async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in.filter((id) => id === ITEM_A).length,
    },
    package: {
      findMany: async (args: { where?: { active?: boolean; province?: string } }) =>
        state.packages.filter((pkg) => {
          if (args.where?.active !== undefined && pkg.active !== args.where.active) {
            return false;
          }
          if (args.where?.province && pkg.province !== args.where.province) {
            return false;
          }
          return true;
        }),
      findUnique: async (args: { where: { id?: string; slug?: string } }) =>
        state.packages.find((pkg) =>
          args.where.id ? pkg.id === args.where.id : pkg.slug === args.where.slug,
        ) ?? null,
      create: async (args: {
        data: {
          name: string;
          slug: string;
          description: string | null;
          province: string | null;
          durationDays: number;
          currency: string;
          basePrice: number;
          active: boolean;
          services: {
            create: { inventoryItemId: string; dayOffset: number; position: number }[];
          };
        };
      }) => {
        const created: FakePackage = {
          id: NEW_ID,
          name: args.data.name,
          slug: args.data.slug,
          description: args.data.description,
          province: args.data.province,
          durationDays: args.data.durationDays,
          currency: args.data.currency,
          basePrice: new Prisma.Decimal(args.data.basePrice),
          active: args.data.active,
          attributes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          services: args.data.services.create.map((service, index) => ({
            id: `new-s${index}`,
            packageId: NEW_ID,
            inventoryItemId: service.inventoryItemId,
            dayOffset: service.dayOffset,
            position: service.position,
            createdAt: new Date(),
            inventoryItem: makeInventoryItem(service.inventoryItemId),
          })),
        };
        state.packages.push(created);
        return created;
      },
      delete: async (args: { where: { id: string } }) => {
        const index = state.packages.findIndex((pkg) => pkg.id === args.where.id);
        if (index >= 0) state.packages.splice(index, 1);
      },
    },
    auditLog: { create: async () => ({}) },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(fake),
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

describe('packages API', () => {
  let app: INestApplication;
  let state: { packages: FakePackage[] };

  beforeEach(async () => {
    state = {
      packages: [
        makePackage(),
        makePackage({ id: INACTIVE_ID, slug: 'retired-trail', active: false }),
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

  it('serves only active packages on the public catalogue', async () => {
    const response = await request(app.getHttpServer()).get('/catalog/packages');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].slug).toBe('vinales-agro-ecology-trail');
    expect(response.body[0].services[0]).toMatchObject({
      inventoryItemId: ITEM_A,
      itemName: 'Casa Particular',
    });
  });

  it('serves a public package by slug and 404s an inactive one', async () => {
    const active = await request(app.getHttpServer()).get(
      '/catalog/packages/vinales-agro-ecology-trail',
    );
    expect(active.status).toBe(200);
    expect(active.body.name).toBe('Vinales Agro-Ecology Trail');

    const inactive = await request(app.getHttpServer()).get(
      '/catalog/packages/retired-trail',
    );
    expect(inactive.status).toBe(404);
  });

  it('lists every package for an operations role', async () => {
    const response = await request(app.getHttpServer())
      .get('/packages')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
  });

  it('creates a package and generates a slug when none is supplied', async () => {
    const response = await request(app.getHttpServer())
      .post('/packages')
      .set('x-test-user', SUPER_ADMIN.email)
      .send({
        name: 'Trinidad Heritage Trail',
        durationDays: 4,
        basePrice: 320,
        services: [{ inventoryItemId: ITEM_A }],
      });

    expect(response.status).toBe(201);
    expect(response.body.slug).toBe('trinidad-heritage-trail');
    expect(response.body.services).toHaveLength(1);
    expect(state.packages.some((pkg) => pkg.slug === 'trinidad-heritage-trail')).toBe(
      true,
    );
  });

  it('rejects a package referencing an unknown catalog item', async () => {
    const response = await request(app.getHttpServer())
      .post('/packages')
      .set('x-test-user', SUPER_ADMIN.email)
      .send({
        name: 'Broken Trail',
        durationDays: 2,
        basePrice: 100,
        services: [{ inventoryItemId: MISSING_ITEM }],
      });

    expect(response.status).toBe(400);
  });

  it('deletes a package for a super admin', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/packages/${PACKAGE_ID}`)
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(204);
    expect(state.packages.some((pkg) => pkg.id === PACKAGE_ID)).toBe(false);
  });

  it('returns 403 for a traveler writing', async () => {
    const response = await request(app.getHttpServer())
      .post('/packages')
      .set('x-test-user', TRAVELER.email)
      .send({
        name: 'Nope',
        durationDays: 2,
        basePrice: 100,
        services: [{ inventoryItemId: ITEM_A }],
      });

    expect(response.status).toBe(403);
  });

  it('returns 401 when unauthenticated for the ops list', async () => {
    const response = await request(app.getHttpServer()).get('/packages');

    expect(response.status).toBe(401);
  });
});

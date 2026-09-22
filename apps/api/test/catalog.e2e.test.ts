import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, type InventoryItem } from '@ota/db';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'ACCOMMODATION',
    name: 'Casa Colonial',
    description: null,
    province: 'La Habana',
    currency: 'EUR',
    basePrice: new Prisma.Decimal('100.00'),
    active: true,
    attributes: null,
    supplierId: null,
    createdAt: new Date('2026-09-20T10:00:00Z'),
    updatedAt: new Date('2026-09-20T10:00:00Z'),
    ...overrides,
  };
}

function createFakePrisma(items: InventoryItem[]) {
  return {
    inventoryItem: {
      findMany: async (args: {
        where?: { active?: boolean; type?: string; province?: string };
      }) =>
        items.filter((item) => {
          const where = args.where ?? {};
          if (where.active !== undefined && item.active !== where.active) return false;
          if (where.type !== undefined && item.type !== where.type) return false;
          if (where.province !== undefined && item.province !== where.province)
            return false;
          return true;
        }),
    },
  };
}

describe('GET /catalog', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const items = [
      makeItem(),
      makeItem({
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Retired Experience',
        active: false,
      }),
      makeItem({
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Classic Car',
        type: 'TRANSPORT',
        province: 'Matanzas',
      }),
    ];

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma(items))
      // No session at all: the endpoint must still answer, proving it is public.
      .overrideProvider(AuthService)
      .useValue({ getSession: async () => null })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('is public and returns only active catalog items', async () => {
    const response = await request(app.getHttpServer()).get('/catalog');

    expect(response.status).toBe(200);
    expect(response.body.map((item: { name: string }) => item.name)).toEqual([
      'Casa Colonial',
      'Classic Car',
    ]);
    expect(response.body[0].media).toEqual([]);
  });

  it('filters the public catalog by type', async () => {
    const response = await request(app.getHttpServer()).get('/catalog?type=TRANSPORT');

    expect(response.status).toBe(200);
    expect(response.body.map((item: { name: string }) => item.name)).toEqual([
      'Classic Car',
    ]);
  });

  it('filters the public catalog by province', async () => {
    const response = await request(app.getHttpServer()).get('/catalog?province=Matanzas');

    expect(response.status).toBe(200);
    expect(response.body.map((item: { name: string }) => item.name)).toEqual([
      'Classic Car',
    ]);
  });
});

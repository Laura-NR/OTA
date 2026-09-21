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
      findMany: async (args: { where?: { active?: boolean } }) =>
        items.filter(
          (item) => args.where?.active === undefined || item.active === args.where.active,
        ),
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
    ]);
  });
});

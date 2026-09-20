import type { InventoryItem, PricingRule as PrismaPricingRule } from '@ota/db';
import { Prisma } from '@ota/db';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import { InventoryService } from '../src/inventory/inventory.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const ITEM_ID = 'inv-1';

const OPERATOR: AuthUser = {
  id: 'user-ops',
  email: 'ops@example.test',
  role: 'OPERATIONS_ADMIN',
};

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: ITEM_ID,
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

describe('InventoryService', () => {
  let items: InventoryItem[];
  let rules: PrismaPricingRule[];
  let audits: string[];

  const fakePrisma = () =>
    ({
      inventoryItem: {
        findMany: async (args: {
          where?: { type?: string; province?: string; active?: boolean };
        }) => {
          let rows = [...items];
          const where = args.where ?? {};
          if (where.type) rows = rows.filter((row) => row.type === where.type);
          if (where.province)
            rows = rows.filter((row) => row.province === where.province);
          if (where.active !== undefined) {
            rows = rows.filter((row) => row.active === where.active);
          }
          return rows;
        },
        findUnique: async (args: {
          where: { id: string };
          include?: { pricingRules?: boolean };
        }) => {
          const item = items.find((row) => row.id === args.where.id);
          if (!item) return null;
          if (args.include?.pricingRules) {
            return {
              ...item,
              pricingRules: rules.filter((rule) => rule.inventoryItemId === item.id),
            };
          }
          return item;
        },
        create: async (args: { data: Record<string, unknown> }) => {
          const item = {
            id: `inv-${items.length + 1}`,
            active: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...args.data,
          } as InventoryItem;
          items.push(item);
          return item;
        },
        update: async (args: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const item = items.find((row) => row.id === args.where.id);
          if (!item) throw new Error('not found');
          const data = { ...args.data };
          delete data.supplier;
          Object.assign(item, data);
          return item;
        },
      },
      pricingRule: {
        findMany: async (args: { where: { inventoryItemId: string } }) =>
          rules.filter((rule) => rule.inventoryItemId === args.where.inventoryItemId),
        create: async (args: { data: Record<string, unknown> }) => {
          const rule = {
            id: `rule-${rules.length + 1}`,
            active: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...args.data,
          } as PrismaPricingRule;
          rules.push(rule);
          return rule;
        },
      },
      auditLog: {
        create: async (args: { data: { action: string } }) => {
          audits.push(args.data.action);
          return args.data;
        },
      },
    }) as unknown as PrismaService;

  beforeEach(() => {
    items = [makeItem()];
    rules = [];
    audits = [];
  });

  it('creates an item and records an audit entry', async () => {
    const service = new InventoryService(fakePrisma());

    const dto = await service.create(
      {
        type: 'TRANSPORT',
        name: 'Classic Car',
        currency: 'EUR',
        basePrice: 80,
      },
      OPERATOR,
    );

    expect(dto.name).toBe('Classic Car');
    expect(dto.type).toBe('TRANSPORT');
    expect(audits).toContain('inventory.created');
  });

  it('filters the list by type', async () => {
    items.push(makeItem({ id: 'inv-2', type: 'TRANSPORT', name: 'Minivan' }));
    const service = new InventoryService(fakePrisma());

    const result = await service.list({ type: 'TRANSPORT' });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Minivan');
  });

  it('updates an item and toggles it inactive', async () => {
    const service = new InventoryService(fakePrisma());

    const dto = await service.update(
      ITEM_ID,
      { basePrice: 150, active: false },
      OPERATOR,
    );

    expect(dto.basePrice).toBe('150');
    expect(dto.active).toBe(false);
    expect(audits).toContain('inventory.updated');
  });

  it('throws 404 for an unknown item', async () => {
    const service = new InventoryService(fakePrisma());

    await expect(service.getById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adds a pricing rule to an existing item', async () => {
    const service = new InventoryService(fakePrisma());

    const dto = await service.addPricingRule(
      ITEM_ID,
      { kind: 'MARKUP', label: 'agency', percent: 15 },
      OPERATOR,
    );

    expect(dto.kind).toBe('MARKUP');
    expect(dto.percent).toBe('15');
    expect(audits).toContain('inventory.pricing_rule_added');
  });

  it('quotes a price with a seasonal rate and markup', async () => {
    const winter = new Date('2026-12-15T00:00:00Z');
    rules.push(
      {
        id: 'rule-1',
        inventoryItemId: ITEM_ID,
        kind: 'SEASONAL_RATE',
        label: 'high season',
        startDate: winter,
        endDate: winter,
        amount: new Prisma.Decimal('220.00'),
        percent: null,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'rule-2',
        inventoryItemId: ITEM_ID,
        kind: 'MARKUP',
        label: 'agency',
        startDate: null,
        endDate: null,
        amount: null,
        percent: new Prisma.Decimal('10.00'),
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    const service = new InventoryService(fakePrisma());

    const quote = await service.priceQuote(ITEM_ID, winter);

    expect(quote).toEqual({ base: 100, seasonal: 220, markup: 22, total: 242 });
  });
});

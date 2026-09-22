import type {
  InventoryItem,
  InventoryMedia,
  PricingRule as PrismaPricingRule,
} from '@ota/db';
import { Prisma } from '@ota/db';
import { NotFoundException } from '@nestjs/common';
import { InMemoryObjectStorage } from '@ota/storage';
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

function makeRule(overrides: Partial<PrismaPricingRule> = {}): PrismaPricingRule {
  return {
    id: 'rule-1',
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
    ...overrides,
  };
}

describe('InventoryService', () => {
  let items: InventoryItem[];
  let rules: PrismaPricingRule[];
  let media: InventoryMedia[];
  let audits: string[];
  let storage: InMemoryObjectStorage;

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
          include?: { pricingRules?: boolean; media?: boolean };
        }) => {
          const item = items.find((row) => row.id === args.where.id);
          if (!item) return null;
          if (args.include?.pricingRules) {
            return {
              ...item,
              pricingRules: rules.filter((rule) => rule.inventoryItemId === item.id),
            };
          }
          if (args.include?.media) {
            return {
              ...item,
              media: media.filter((entry) => entry.inventoryItemId === item.id),
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
        delete: async (args: { where: { id: string } }) => {
          const index = items.findIndex((row) => row.id === args.where.id);
          if (index < 0) throw new Error('not found');
          return items.splice(index, 1)[0];
        },
      },
      pricingRule: {
        findMany: async (args: { where: { inventoryItemId: string } }) =>
          rules.filter((rule) => rule.inventoryItemId === args.where.inventoryItemId),
        findUnique: async (args: { where: { id: string } }) =>
          rules.find((rule) => rule.id === args.where.id) ?? null,
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
        update: async (args: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const rule = rules.find((row) => row.id === args.where.id);
          if (!rule) throw new Error('not found');
          Object.assign(rule, args.data);
          return rule;
        },
        delete: async (args: { where: { id: string } }) => {
          const index = rules.findIndex((row) => row.id === args.where.id);
          if (index < 0) throw new Error('not found');
          return rules.splice(index, 1)[0];
        },
      },
      inventoryMedia: {
        count: async (args: { where: { inventoryItemId: string } }) =>
          media.filter((entry) => entry.inventoryItemId === args.where.inventoryItemId)
            .length,
        findMany: async (args: { where: { inventoryItemId: string } }) =>
          media.filter((entry) => entry.inventoryItemId === args.where.inventoryItemId),
        findUnique: async (args: {
          where: { id: string };
          include?: { inventoryItem?: boolean };
        }) => {
          const entry = media.find((row) => row.id === args.where.id);
          if (!entry) return null;
          if (args.include?.inventoryItem) {
            return {
              ...entry,
              inventoryItem: items.find((item) => item.id === entry.inventoryItemId),
            };
          }
          return entry;
        },
        create: async (args: { data: Record<string, unknown> }) => {
          const entry = {
            id: `media-${media.length + 1}`,
            position: 0,
            createdAt: new Date(),
            ...args.data,
          } as InventoryMedia;
          media.push(entry);
          return entry;
        },
        delete: async (args: { where: { id: string } }) => {
          const index = media.findIndex((row) => row.id === args.where.id);
          if (index < 0) throw new Error('not found');
          return media.splice(index, 1)[0];
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
    media = [];
    audits = [];
    storage = new InMemoryObjectStorage();
  });

  function service(): InventoryService {
    return new InventoryService(fakePrisma(), storage);
  }

  it('creates an item and records an audit entry', async () => {
    const dto = await service().create(
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

    const result = await service().list({ type: 'TRANSPORT' });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Minivan');
  });

  it('updates an item and toggles it inactive', async () => {
    const dto = await service().update(
      ITEM_ID,
      { basePrice: 150, active: false },
      OPERATOR,
    );

    expect(dto.basePrice).toBe('150');
    expect(dto.active).toBe(false);
    expect(audits).toContain('inventory.updated');
  });

  it('throws 404 for an unknown item', async () => {
    await expect(service().getById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hard-deletes an item and records an audit entry', async () => {
    await service().remove(ITEM_ID, OPERATOR);

    expect(items).toHaveLength(0);
    expect(audits).toContain('inventory.deleted');
  });

  it('throws 404 when deleting an unknown item', async () => {
    await expect(service().remove('missing', OPERATOR)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('adds a pricing rule to an existing item', async () => {
    const dto = await service().addPricingRule(
      ITEM_ID,
      { kind: 'MARKUP', label: 'agency', percent: 15 },
      OPERATOR,
    );

    expect(dto.kind).toBe('MARKUP');
    expect(dto.percent).toBe('15');
    expect(audits).toContain('inventory.pricing_rule_added');
  });

  it('updates a pricing rule', async () => {
    rules.push(makeRule());

    const dto = await service().updatePricingRule(
      ITEM_ID,
      'rule-1',
      { percent: 20, active: false },
      OPERATOR,
    );

    expect(dto.percent).toBe('20');
    expect(dto.active).toBe(false);
    expect(audits).toContain('inventory.pricing_rule_updated');
  });

  it('refuses to update a rule that belongs to another item', async () => {
    rules.push(makeRule({ inventoryItemId: 'inv-other' }));

    await expect(
      service().updatePricingRule(ITEM_ID, 'rule-1', { percent: 20 }, OPERATOR),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes a pricing rule', async () => {
    rules.push(makeRule());

    await service().deletePricingRule(ITEM_ID, 'rule-1', OPERATOR);

    expect(rules).toHaveLength(0);
    expect(audits).toContain('inventory.pricing_rule_deleted');
  });

  it('stores a gallery image and lists it with its content type', async () => {
    const dto = await service().addMedia(
      ITEM_ID,
      {
        contentType: 'image/png',
        contentBase64: Buffer.from('fake-png').toString('base64'),
        altText: 'Front view',
      },
      OPERATOR,
    );

    expect(dto.position).toBe(0);
    expect(dto.altText).toBe('Front view');
    expect(dto.contentType).toBe('image/png');

    const stored = await service().listMedia(ITEM_ID);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(dto.id);
    expect(audits).toContain('inventory.media_added');
  });

  it('deletes a gallery image and its stored object', async () => {
    const dto = await service().addMedia(
      ITEM_ID,
      { contentType: 'image/jpeg', contentBase64: Buffer.from('x').toString('base64') },
      OPERATOR,
    );

    await service().deleteMedia(ITEM_ID, dto.id, OPERATOR);

    expect(media).toHaveLength(0);
    expect(audits).toContain('inventory.media_deleted');
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

    const quote = await service().priceQuote(ITEM_ID, winter);

    expect(quote).toEqual({ base: 100, seasonal: 220, markup: 22, total: 242 });
  });
});

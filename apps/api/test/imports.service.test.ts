import type { ImportBatch } from '@ota/db';
import { UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import { ImportsService } from '../src/imports/imports.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const OPERATOR: AuthUser = {
  id: 'user-ops',
  email: 'ops@example.test',
  role: 'OPERATIONS_ADMIN',
};

const csv = [
  'Hotel Name,Category,Province,Price',
  'Casa Colonial,ACCOMMODATION,La Habana,120',
  'Vintage Ride,TRANSPORT,La Habana,80',
].join('\n');

describe('ImportsService', () => {
  let batches: ImportBatch[];
  let inventoryCreated: number;
  let audits: string[];

  const fakePrisma = () => {
    const fake = {
      importBatch: {
        create: async (args: { data: Partial<ImportBatch> }) => {
          const batch = {
            id: `batch-${batches.length + 1}`,
            status: 'STAGED',
            mapping: null,
            importedCount: null,
            errors: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...args.data,
          } as ImportBatch;
          batches.push(batch);
          return batch;
        },
        findUnique: async (args: { where: { id: string } }) =>
          batches.find((batch) => batch.id === args.where.id) ?? null,
        update: async (args: { where: { id: string }; data: Partial<ImportBatch> }) => {
          const batch = batches.find((item) => item.id === args.where.id);
          if (!batch) throw new Error('not found');
          Object.assign(batch, args.data);
          return batch;
        },
      },
      inventoryItem: {
        create: async () => {
          inventoryCreated += 1;
          return {};
        },
      },
      auditLog: {
        create: async (args: { data: { action: string } }) => {
          audits.push(args.data.action);
          return args.data;
        },
      },
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(fake),
    };
    return fake as unknown as PrismaService;
  };

  beforeEach(() => {
    batches = [];
    inventoryCreated = 0;
    audits = [];
  });

  it('parses an upload and stages it with a preview', async () => {
    const service = new ImportsService(fakePrisma());

    const preview = await service.preview(
      'grid.csv',
      Buffer.from(csv).toString('base64'),
      OPERATOR,
    );

    expect(preview.columns).toEqual(['Hotel Name', 'Category', 'Province', 'Price']);
    expect(preview.rowCount).toBe(2);
    expect(preview.preview).toHaveLength(2);
    expect(batches[0]?.status).toBe('STAGED');
  });

  it('commits a valid mapping and creates inventory items', async () => {
    const service = new ImportsService(fakePrisma());
    const preview = await service.preview(
      'grid.csv',
      Buffer.from(csv).toString('base64'),
      OPERATOR,
    );

    const result = await service.commit(
      preview.batchId,
      {
        mapping: {
          name: 'Hotel Name',
          type: 'Category',
          province: 'Province',
          basePrice: 'Price',
        },
      },
      OPERATOR,
    );

    expect(result.importedCount).toBe(2);
    expect(inventoryCreated).toBe(2);
    expect(audits).toContain('import.committed');
    expect(batches[0]?.status).toBe('COMMITTED');
  });

  it('rejects invalid rows and records the errors on the batch', async () => {
    const badCsv = [
      'Hotel Name,Category,Price',
      'Casa Colonial,ACCOMMODATION,120',
      ',MADE_UP,-5',
    ].join('\n');
    const service = new ImportsService(fakePrisma());
    const preview = await service.preview(
      'grid.csv',
      Buffer.from(badCsv).toString('base64'),
      OPERATOR,
    );

    await expect(
      service.commit(
        preview.batchId,
        { mapping: { name: 'Hotel Name', type: 'Category', basePrice: 'Price' } },
        OPERATOR,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(inventoryCreated).toBe(0);
    expect(batches[0]?.status).toBe('FAILED');
  });
});

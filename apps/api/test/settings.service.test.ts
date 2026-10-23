import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { parseTenantConfig } from '@ota/config';
import { Prisma } from '@ota/db';
import { DEFAULT_OPERATING_THRESHOLDS } from '@ota/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import type { PrismaService } from '../src/prisma/prisma.service';
import { OperatingSettingsService } from '../src/settings/operating-settings.service';

const DAYANA: AuthUser = {
  id: 'u-dayana',
  email: 'dayana@vereda.test',
  role: 'SUPER_ADMIN',
};
const FOUNDER: AuthUser = {
  id: 'u-founder',
  email: 'founder@vereda.test',
  role: 'SUPER_ADMIN',
};
const ANA: AuthUser = { id: 'u-ana', email: 'ana@vereda.test', role: 'OPERATIONS_ADMIN' };

const tenant = parseTenantConfig({
  tenantId: 'vereda',
  branding: { agencyName: 'Vereda', licenseNumber: 'MINTUR-TEST' },
  payments: { windowHours: 36, refundApproval: { singleUpTo: 400, dualUpTo: 1500 } },
});

type Row = Record<string, unknown> & { id: string; version: number; status: string };

/** An in-memory operating_settings table with its one-pending rule. */
function fakePrisma() {
  const rows: Row[] = [];
  const audits: Record<string, unknown>[] = [];
  let sequence = 0;
  const person = (id: unknown) =>
    id ? { fullName: String(id).replace('u-', ''), email: `${String(id)}@x.test` } : null;
  const view = (row: Row) => ({
    ...row,
    proposedBy: person(row.proposedById),
    decidedBy: person(row.decidedById),
  });
  const prisma = {
    rows,
    audits,
    operatingSettings: {
      findFirst: async ({
        where,
        orderBy,
      }: {
        where?: { status?: string };
        orderBy?: { version: 'desc' };
      }) => {
        const found = rows
          .filter((row) => !where?.status || row.status === where.status)
          .sort((a, b) => (orderBy ? b.version - a.version : 0));
        return found[0] ? view(found[0]) : null;
      },
      findMany: async () => [...rows].sort((a, b) => b.version - a.version).map(view),
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.find((row) => row.id === where.id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (rows.some((row) => row.status === 'PROPOSED')) {
          throw new Prisma.PrismaClientKnownRequestError('one proposed', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const row: Row = {
          id: `00000000-0000-4000-8000-${String((sequence += 1)).padStart(12, '0')}`,
          status: 'PROPOSED',
          decidedById: null,
          decidedAt: null,
          createdAt: new Date(),
          ...(data as { version: number }),
        };
        rows.push(row);
        return view(row);
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status: string };
        data: Record<string, unknown>;
      }) => {
        const row = rows.find(
          (item) => item.id === where.id && item.status === where.status,
        );
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      },
    },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> =>
      work(prisma),
  };
  return prisma;
}

describe('OperatingSettingsService (M9 D1–D3)', () => {
  let prisma: ReturnType<typeof fakePrisma>;
  let service: OperatingSettingsService;

  beforeEach(() => {
    prisma = fakePrisma();
    service = new OperatingSettingsService(prisma as unknown as PrismaService, tenant);
  });

  it('runs on the code defaults with the manifest payment terms until a version applies', async () => {
    const overview = await service.overview();
    expect(overview.version).toBe(0);
    expect(overview.values).toEqual({
      ...DEFAULT_OPERATING_THRESHOLDS,
      paymentWindowHours: 36,
      refundSingleUpTo: 400,
      refundDualUpTo: 1500,
    });
    expect(overview.pending).toBeNull();
  });

  it('applies a proposal only with a second Super Admin, then runs on it', async () => {
    const values = { ...(await service.thresholds()), amberPercent: 80 };
    const proposal = await service.propose(DAYANA, { values, reason: 'Earlier warning' });
    expect(proposal).toMatchObject({
      version: 1,
      status: 'PROPOSED',
      changes: ['amberPercent'],
    });
    expect((await service.overview()).pending?.id).toBe(proposal.id);

    await expect(service.decide(DAYANA, proposal.id, 'APPLY')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.decide(ANA, proposal.id, 'APPLY')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const applied = await service.decide(FOUNDER, proposal.id, 'APPLY');
    expect(applied).toMatchObject({
      version: 1,
      appliedByName: 'founder',
      pending: null,
    });
    expect((await service.thresholds()).amberPercent).toBe(80);
    expect(prisma.audits.map((entry) => entry.action)).toEqual([
      'settings.proposed',
      'settings.applied',
    ]);
    await expect(service.decide(FOUNDER, proposal.id, 'APPLY')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('keeps one proposal waiting at a time, and lets only its author withdraw it', async () => {
    const values = { ...(await service.thresholds()), resourcesStaleDays: 5 };
    const proposal = await service.propose(DAYANA, {
      values,
      reason: 'Weekly is too long',
    });
    await expect(
      service.propose(FOUNDER, {
        values: { ...values, amberPercent: 70 },
        reason: 'Another one',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.decide(FOUNDER, proposal.id, 'WITHDRAW')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await service.decide(DAYANA, proposal.id, 'WITHDRAW');
    expect((await service.thresholds()).resourcesStaleDays).toBe(7);
    expect(prisma.rows[0]).toMatchObject({ status: 'WITHDRAWN' });
  });

  it('refuses a proposal whose refund limits fall or that changes nothing', async () => {
    const current = await service.thresholds();
    await expect(
      service.propose(DAYANA, {
        values: { ...current, refundSingleUpTo: 2000, refundDualUpTo: 1000 },
        reason: 'Wrong way round',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      service.propose(DAYANA, { values: current, reason: 'Nothing' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

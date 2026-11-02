import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { parseTenantConfig } from '@ota/config';
import { Prisma } from '@ota/db';
import { DEFAULT_OPERATING_THRESHOLDS, FEATURE_FLAGS } from '@ota/domain';
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

describe('switching the Super Admin IP allowlist on (docs/schema-m9-ip-allowlist.md I4, I8)', () => {
  let prisma: ReturnType<typeof fakePrisma>;
  let service: OperatingSettingsService;
  const HAVANA = { label: 'Havana office', cidr: '203.0.113.0/24' };

  beforeEach(() => {
    prisma = fakePrisma();
    service = new OperatingSettingsService(prisma as unknown as PrismaService, tenant);
  });

  const propose = async (cidr: string) =>
    service.propose(DAYANA, {
      values: {
        ...(await service.thresholds()),
        superAdminIpAllowlistOn: true,
        superAdminIpAllowlist: [{ ...HAVANA, cidr }],
      },
      reason: 'Office only',
    });

  it("refuses an apply whose list would refuse the applier's own sign-in, naming the address", async () => {
    const proposal = await propose('192.0.2.0/24');
    const applier = { ...FOUNDER, signInAddress: '203.0.113.9' };
    const refused = await service.decide(applier, proposal.id, 'APPLY').catch((e) => e);
    expect(refused).toBeInstanceOf(UnprocessableEntityException);
    expect((refused as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'IP_ALLOWLIST_EXCLUDES_YOU',
      ipAddress: '203.0.113.9',
      message:
        'This IP allowlist would refuse your own sign-in from 203.0.113.9; add it before applying',
    });
    expect(prisma.rows[0]).toMatchObject({ status: 'PROPOSED' });
    expect((await service.thresholds()).superAdminIpAllowlistOn).toBe(false);
  });

  it('refuses it when the applier has no recorded address', async () => {
    const proposal = await propose('203.0.113.0/24');
    await expect(
      service.decide({ ...FOUNDER, signInAddress: null }, proposal.id, 'APPLY'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("applies a list holding the applier's address, and tells the caller their address", async () => {
    const proposal = await propose('203.0.113.0/24');
    const applier = { ...FOUNDER, signInAddress: '203.0.113.9' };
    const applied = await service.decide(applier, proposal.id, 'APPLY');
    expect(applied.values).toMatchObject({
      superAdminIpAllowlistOn: true,
      superAdminIpAllowlist: [HAVANA],
    });
    expect(applied.signInAddress).toBe('203.0.113.9');
    expect(prisma.audits.at(-1)).toMatchObject({
      action: 'settings.applied',
      metadata: { changes: ['superAdminIpAllowlistOn', 'superAdminIpAllowlist'] },
    });
  });

  it('cannot be proposed on with an empty list', async () => {
    await expect(
      service.propose(DAYANA, {
        values: { ...(await service.thresholds()), superAdminIpAllowlistOn: true },
        reason: 'Empty',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('lets a rejection or a switched-off list through wherever the decider is', async () => {
    const proposal = await propose('192.0.2.0/24');
    await service.decide({ ...FOUNDER, signInAddress: '203.0.113.9' }, proposal.id, 'REJECT');
    expect(prisma.rows[0]).toMatchObject({ status: 'REJECTED' });
    const off = await service.propose(DAYANA, {
      values: { ...(await service.thresholds()), superAdminIpAllowlist: [HAVANA] },
      reason: 'Prepare the list',
    });
    await service.decide({ ...FOUNDER, signInAddress: '198.51.100.7' }, off.id, 'APPLY');
    expect((await service.thresholds()).superAdminIpAllowlist).toEqual([HAVANA]);
  });
});

describe('runtime feature flags on the settings (M9 D8b)', () => {
  const portalOff = parseTenantConfig({
    tenantId: 'vereda',
    branding: { agencyName: 'Vereda', licenseNumber: 'MINTUR-TEST' },
    features: { recruitmentPortal: false },
  });
  let prisma: ReturnType<typeof fakePrisma>;
  let service: OperatingSettingsService;

  beforeEach(() => {
    prisma = fakePrisma();
    service = new OperatingSettingsService(prisma as unknown as PrismaService, portalOff);
  });

  async function refusal(
    flag: Parameters<OperatingSettingsService['requireFeature']>[0],
  ) {
    try {
      await service.requireFeature(flag);
      return null;
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      return (error as ConflictException).getResponse();
    }
  }

  it("runs on the manifest's flags until a version applies", async () => {
    const features = await service.features();
    expect(features.recruitmentPortal).toBe(false);
    expect(features.customItineraryBuilder).toBe(true);
    expect((await service.overview()).defaults.recruitmentPortal).toBe(false);
    expect(await refusal('recruitmentPortal')).toMatchObject({
      statusCode: 409,
      code: 'FEATURE_OFF',
      feature: 'recruitmentPortal',
    });
    expect(await refusal('customItineraryBuilder')).toBeNull();
  });

  it('switches a flag once a second Super Admin applies it, and refuses at once', async () => {
    const values = {
      ...(await service.thresholds()),
      recruitmentPortal: true,
      creditCardGatewayRail: false,
    };
    const proposal = await service.propose(DAYANA, {
      values,
      reason: 'Card gateway down',
    });
    expect(proposal.changes).toEqual(['recruitmentPortal', 'creditCardGatewayRail']);
    // Proposed is not applied.
    expect(await refusal('creditCardGatewayRail')).toBeNull();

    await service.decide(FOUNDER, proposal.id, 'APPLY');
    expect(await refusal('creditCardGatewayRail')).toMatchObject({
      code: 'FEATURE_OFF',
      feature: 'creditCardGatewayRail',
    });
    expect(await refusal('recruitmentPortal')).toBeNull();
    expect(prisma.audits.at(-1)).toMatchObject({
      action: 'settings.applied',
      metadata: { changes: ['recruitmentPortal', 'creditCardGatewayRail'] },
    });
  });

  it("keeps the manifest's flags under a version written before the flags existed", async () => {
    prisma.rows.push({
      id: '00000000-0000-4000-8000-000000000099',
      version: 1,
      status: 'APPLIED',
      values: {
        ...Object.fromEntries(
          Object.entries(DEFAULT_OPERATING_THRESHOLDS).filter(
            ([key]) => !(FEATURE_FLAGS as readonly string[]).includes(key),
          ),
        ),
        amberPercent: 80,
      },
      reason: 'Before D8b',
      proposedById: 'u-dayana',
      decidedById: 'u-founder',
      decidedAt: new Date(),
      createdAt: new Date(),
    });
    expect((await service.thresholds()).amberPercent).toBe(80);
    expect((await service.features()).recruitmentPortal).toBe(false);
  });
});

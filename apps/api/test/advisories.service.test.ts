import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import type { EmailMessage, Mailer } from '@ota/email';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdvisoriesService } from '../src/advisories/advisories.service';
import type { AuthUser } from '../src/common/auth/auth-user';
import type { PrismaService } from '../src/prisma/prisma.service';

const ANA: AuthUser = {
  id: 'u-ana',
  email: 'ana@example.test',
  role: 'OPERATIONS_ADMIN',
};
const ERNESTO: AuthUser = {
  id: 'u-ernesto',
  email: 'ernesto@example.test',
  role: 'OPERATIONS_ADMIN',
};
const DAYANA: AuthUser = {
  id: 'u-dayana',
  email: 'dayana@example.test',
  role: 'SUPER_ADMIN',
};
const LUIS: AuthUser = {
  id: 'u-luis',
  email: 'luis@example.test',
  role: 'ADMINISTRATIVE_SUPPORT',
};

const tenant = {
  primaryLocale: 'es',
  supportedLocales: ['es', 'en', 'fr'],
  branding: {
    agencyName: 'Vereda',
    licenseNumber: 'MINTUR-TEST',
    primaryColor: '#0B4F6C',
  },
} as unknown as TenantConfig;

const DAY = 86_400_000;

interface AdvisoryRow {
  id: string;
  reference: string;
  severity: 'INFO' | 'CAUTION' | 'CRITICAL';
  status: string;
  regions: string[];
  effectiveFrom: Date;
  expiresAt: Date;
  source: string;
  sourceLocale: string;
  showOnSite: boolean;
  showOnPackages: boolean;
  notifyTravelers: boolean;
  supersedesId: string | null;
  createdById: string | null;
  publishedAt: Date | null;
  liftedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Just enough Prisma for the approval and delivery paths, in memory. */
function fakePrisma(seed: { advisory: AdvisoryRow; reservations: unknown[] }) {
  const advisories = new Map<string, AdvisoryRow>([[seed.advisory.id, seed.advisory]]);
  const translations = [
    {
      advisoryId: seed.advisory.id,
      locale: 'en',
      headline: 'Fuel queues in Pinar del Río',
      body: 'Station queues around Viñales.',
      cta: null,
    },
  ];
  const approvals: {
    id: string;
    advisoryId: string;
    approverId: string;
    role: string;
    createdAt: Date;
  }[] = [];
  const audits: { action: string; entityId?: string; metadata?: unknown }[] = [];

  const withRelations = (row: AdvisoryRow) => ({
    ...row,
    translations: translations.filter((item) => item.advisoryId === row.id),
    approvals: approvals
      .filter((item) => item.advisoryId === row.id)
      .map((item) => ({ ...item, approver: { fullName: item.approverId, email: 'x' } })),
    createdBy: null,
    supersedes: null,
    supersededBy: null,
  });

  const prisma = {
    audits,
    translations,
    advisory: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = advisories.get(where.id);
        return row ? withRelations(row) : null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<AdvisoryRow>;
      }) => {
        const row = advisories.get(where.id)!;
        Object.assign(row, data);
        return row;
      },
      updateMany: async () => ({ count: 0 }),
    },
    advisoryApproval: {
      create: async ({
        data,
      }: {
        data: { advisoryId: string; approverId: string; role: string };
      }) => {
        const row = { id: `ap-${approvals.length}`, createdAt: new Date(), ...data };
        approvals.push(row);
        return row;
      },
    },
    advisoryAcknowledgement: { count: async () => 0 },
    auditLog: {
      create: async ({
        data,
      }: {
        data: { action: string; entityId?: string; metadata?: unknown };
      }) => {
        audits.push(data);
        return data;
      },
      findMany: async ({ where }: { where: { action: string; entityId: string } }) =>
        audits.filter(
          (row) => row.action === where.action && row.entityId === where.entityId,
        ),
      count: async ({ where }: { where: { action: string; entityId: string } }) =>
        audits.filter(
          (row) => row.action === where.action && row.entityId === where.entityId,
        ).length,
    },
    reservation: { findMany: async () => seed.reservations },
    $queryRaw: async () => [],
    $transaction: async (work: unknown) =>
      typeof work === 'function'
        ? (work as (tx: unknown) => Promise<unknown>)(prisma)
        : Promise.all(work as Promise<unknown>[]),
  };
  return prisma;
}

function mailer(): Mailer & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return { sent, send: async (message: EmailMessage) => void sent.push(message) };
}

function advisory(overrides: Partial<AdvisoryRow> = {}): AdvisoryRow {
  const now = Date.now();
  return {
    id: 'adv-1',
    reference: 'ADV-2026-031',
    severity: 'CAUTION',
    status: 'DRAFT',
    regions: ['CU01'],
    effectiveFrom: new Date(now - DAY),
    expiresAt: new Date(now + 30 * DAY),
    source: 'Vereda drivers',
    sourceLocale: 'en',
    showOnSite: true,
    showOnPackages: true,
    notifyTravelers: true,
    supersedesId: null,
    createdById: ANA.id,
    publishedAt: null,
    liftedAt: null,
    createdAt: new Date(now - DAY),
    updatedAt: new Date(now - DAY),
    ...overrides,
  };
}

function reservation(id: string, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id,
    userId: `user-${id}`,
    bookingCode: `CODE-${id}`,
    status: 'CONFIRMED',
    startDate: new Date(now + 10 * DAY),
    endDate: new Date(now + 17 * DAY),
    user: {
      email: `${id}@example.test`,
      fullName: `Traveler ${id}`,
      locale: 'en',
      anonymizedAt: null,
    },
    package: { name: 'Eco-Tourism in Viñales', province: null },
    serviceItems: [{ province: 'Pinar del Río' }],
    ...overrides,
  };
}

describe('AdvisoriesService', () => {
  let mail: ReturnType<typeof mailer>;

  beforeEach(() => {
    mail = mailer();
  });

  it('publishes a caution on one approval and emails only the reached travelers, once', async () => {
    const prisma = fakePrisma({
      advisory: advisory(),
      reservations: [
        reservation('reached'),
        reservation('elsewhere', { serviceItems: [{ province: 'La Habana' }] }),
        reservation('anonymized', {
          user: { email: 'gone', fullName: null, locale: 'en', anonymizedAt: new Date() },
        }),
      ],
    });
    const service = new AdvisoriesService(
      prisma as unknown as PrismaService,
      mail,
      tenant,
    );

    const result = await service.approve(ANA, 'adv-1');

    expect(result.status).toBe('PUBLISHED');
    expect(result.deliveredCount).toBe(1);
    expect(mail.sent.map((message) => message.to)).toEqual(['reached@example.test']);
    expect(mail.sent[0]!.text).toContain('CODE-reached');
    expect(prisma.audits.map((row) => row.action)).toEqual([
      'advisory.approved',
      'advisory.published',
      'advisory.delivered',
    ]);

    // A second delivery pass finds the ledger and sends nothing.
    expect(await service.deliver('adv-1')).toBe(0);
    expect(mail.sent).toHaveLength(1);
  });

  it('holds a critical advisory for a super admin, then publishes on the second person', async () => {
    const prisma = fakePrisma({
      advisory: advisory({ severity: 'CRITICAL' }),
      reservations: [reservation('reached')],
    });
    for (const locale of ['es', 'fr']) {
      prisma.translations.push({
        advisoryId: 'adv-1',
        locale,
        headline: `headline ${locale}`,
        body: `body ${locale}`,
        cta: null,
      });
    }
    const service = new AdvisoriesService(
      prisma as unknown as PrismaService,
      mail,
      tenant,
    );

    const first = await service.approve(ANA, 'adv-1');
    expect(first.status).toBe('IN_REVIEW');
    expect(first.missingApprovals).toEqual(['SUPER_ADMIN']);
    expect(mail.sent).toHaveLength(0);

    await expect(service.approve(ANA, 'adv-1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.approve(ERNESTO, 'adv-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.approve(LUIS, 'adv-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const second = await service.approve(DAYANA, 'adv-1');
    expect(second.status).toBe('PUBLISHED');
    expect(second.approvals.map((approval) => approval.role)).toEqual([
      'OPERATIONS_ADMIN',
      'SUPER_ADMIN',
    ]);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.text).toContain('acknowledge it on the site');
  });

  it('refuses to publish a critical advisory missing a tenant language', async () => {
    const prisma = fakePrisma({
      advisory: advisory({ severity: 'CRITICAL' }),
      reservations: [],
    });
    const service = new AdvisoriesService(
      prisma as unknown as PrismaService,
      mail,
      tenant,
    );

    await service.approve(ANA, 'adv-1');
    await expect(service.approve(DAYANA, 'adv-1')).rejects.toThrow(
      'Translations missing before publishing: es, fr',
    );
  });

  it('emails nobody for an info advisory', async () => {
    const prisma = fakePrisma({
      advisory: advisory({ severity: 'INFO' }),
      reservations: [reservation('reached')],
    });
    const service = new AdvisoriesService(
      prisma as unknown as PrismaService,
      mail,
      tenant,
    );

    const result = await service.approve(ANA, 'adv-1');

    expect(result.status).toBe('PUBLISHED');
    expect(mail.sent).toHaveLength(0);
  });
});

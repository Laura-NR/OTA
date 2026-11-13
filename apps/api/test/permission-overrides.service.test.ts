import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { parseTenantConfig } from '@ota/config';
import type { EmailMessage, Mailer } from '@ota/email';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import { PermissionOverridesService } from '../src/overrides/permission-overrides.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { fakeOperatingSettings } from './fixtures/operating-settings';

const tenant = parseTenantConfig({
  tenantId: 'vereda',
  branding: { agencyName: 'Vereda', licenseNumber: 'MINTUR-TEST' },
  primaryLocale: 'en',
});

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-11-02T09:00:00Z');
const later = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

const ERNESTO: AuthUser = {
  id: 'u-ernesto',
  email: 'ernesto@vereda.travel',
  role: 'ADMINISTRATIVE_SUPPORT',
};
const ANA: AuthUser = {
  id: 'u-ana',
  email: 'ana@vereda.travel',
  role: 'OPERATIONS_ADMIN',
};
const DAYANA: AuthUser = {
  id: 'u-dayana',
  email: 'dayana@vereda.travel',
  role: 'SUPER_ADMIN',
};

interface Row {
  id: string;
  userId: string;
  capability: string;
  reason: string;
  state: string;
  requestedAt: Date;
  decidedById: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  expiresAt: Date | null;
  endedById: string | null;
  endedAt: Date | null;
  endNote: string | null;
}

type Where = {
  id?: string;
  userId?: string;
  capability?: string;
  state?: string | { in: string[] };
  expiresAt?: { gt: Date };
  requestedAt?: { gte: Date };
  OR?: Where[];
};

function matches(row: Row, where: Where): boolean {
  if (where.id && row.id !== where.id) return false;
  if (where.userId && row.userId !== where.userId) return false;
  if (where.capability && row.capability !== where.capability) return false;
  if (typeof where.state === 'string' && row.state !== where.state) return false;
  if (typeof where.state === 'object' && !where.state.in.includes(row.state))
    return false;
  if (where.expiresAt && !(row.expiresAt && row.expiresAt > where.expiresAt.gt))
    return false;
  if (where.requestedAt && row.requestedAt < where.requestedAt.gte) return false;
  if (where.OR && !where.OR.some((rule) => matches(row, rule))) return false;
  return true;
}

function fakePrisma() {
  const users = [
    {
      id: ERNESTO.id,
      email: ERNESTO.email,
      fullName: 'Ernesto Vila',
      role: ERNESTO.role,
      deactivatedAt: null,
    },
    {
      id: ANA.id,
      email: ANA.email,
      fullName: 'Ana Ruiz',
      role: ANA.role,
      deactivatedAt: null,
    },
    {
      id: DAYANA.id,
      email: DAYANA.email,
      fullName: 'Dayana Rodríguez',
      role: DAYANA.role,
      deactivatedAt: null,
    },
    {
      id: 'u-founder',
      email: 'founder@vereda.travel',
      fullName: null,
      role: 'SUPER_ADMIN',
      deactivatedAt: null,
    },
    {
      id: 'u-gone',
      email: 'gone@vereda.travel',
      fullName: null,
      role: 'SUPER_ADMIN',
      deactivatedAt: new Date('2026-10-01'),
    },
  ];
  const rows: Row[] = [];
  const audits: Record<string, unknown>[] = [];
  let sequence = 0;
  const person = (id: string | null) => {
    const user = users.find((item) => item.id === id);
    return user ? { fullName: user.fullName, email: user.email, role: user.role } : null;
  };
  const view = (row: Row) => ({
    ...row,
    user: person(row.userId)!,
    decidedBy: person(row.decidedById),
    endedBy: person(row.endedById),
  });
  const prisma = {
    rows,
    audits,
    user: {
      findMany: async ({ where }: { where: { role: string; deactivatedAt: null } }) =>
        users.filter((user) => user.role === where.role && user.deactivatedAt === null),
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      },
    },
    permissionOverride: {
      findMany: async ({ where }: { where: Where }) =>
        rows
          .filter((row) => matches(row, where))
          .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
          .map(view),
      findFirst: async ({ where }: { where: Where }) => {
        const row = rows.find((item) => matches(item, where));
        return row ? { id: row.id } : null;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = rows.find((item) => item.id === where.id);
        return row ? view(row) : null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) =>
        view(rows.find((item) => item.id === where.id)!),
      create: async ({ data }: { data: Partial<Row> }) => {
        const row: Row = {
          id: `o-${++sequence}`,
          userId: data.userId!,
          capability: data.capability!,
          reason: data.reason!,
          state: 'REQUESTED',
          requestedAt: data.requestedAt ?? NOW,
          decidedById: null,
          decidedAt: null,
          decisionNote: null,
          expiresAt: null,
          endedById: null,
          endedAt: null,
          endNote: null,
        };
        rows.push(row);
        return view(row);
      },
      updateMany: async ({ where, data }: { where: Where; data: Partial<Row> }) => {
        const changed = rows.filter((row) => matches(row, where));
        for (const row of changed) Object.assign(row, data);
        return { count: changed.length };
      },
    },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(prisma),
  };
  return prisma;
}

class FakeMailer implements Mailer {
  sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

describe('PermissionOverridesService (docs/schema-m9-permission-overrides.md)', () => {
  let prisma: ReturnType<typeof fakePrisma>;
  let mailer: FakeMailer;
  let service: PermissionOverridesService;

  beforeEach(() => {
    prisma = fakePrisma();
    mailer = new FakeMailer();
    service = new PermissionOverridesService(
      prisma as unknown as PrismaService,
      fakeOperatingSettings({ overrideExpiryHours: 8 }),
      mailer,
      tenant,
    );
  });

  const ask = () =>
    service.request(ERNESTO, { capability: 'payments', reason: 'Covering for Ana' }, NOW);

  it('records a request with its reason, audits it and emails every active Super Admin (O4, O8)', async () => {
    const asked = await ask();
    expect(asked).toMatchObject({
      userName: 'Ernesto Vila',
      capability: 'payments',
      reason: 'Covering for Ana',
      status: 'REQUESTED',
      expiresAt: null,
    });
    expect(prisma.audits.at(-1)).toMatchObject({
      actorUserId: ERNESTO.id,
      action: 'permission.override_requested',
      entityType: 'PermissionOverride',
      entityId: asked.id,
      metadata: { capability: 'payments', reason: 'Covering for Ana' },
    });
    expect(mailer.sent.map((email) => email.to).sort()).toEqual([
      'dayana@vereda.travel',
      'founder@vereda.travel',
    ]);
    expect(mailer.sent[0]!.text).toContain('it ends 8 h after approval');
  });

  it('refuses a row the role holds, a Super Admin row, and a second open request (O2, O4)', async () => {
    await expect(
      service.request(ERNESTO, { capability: 'messages', reason: 'x'.repeat(5) }, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.request(ERNESTO, { capability: 'thresholds', reason: 'x'.repeat(5) }, NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.request(ANA, { capability: 'staff', reason: 'x'.repeat(5) }, NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await ask();
    await expect(ask()).rejects.toBeInstanceOf(ConflictException);
  });

  it('starts the clock at approval, from the expiry threshold, audited with the note (O5)', async () => {
    const asked = await ask();
    const approved = await service.approve(
      DAYANA,
      asked.id,
      { note: 'Until Ana is back' },
      later(1),
    );
    expect(approved).toMatchObject({
      status: 'ACTIVE',
      decidedByName: 'Dayana Rodríguez',
      decisionNote: 'Until Ana is back',
      expiresAt: later(9).toISOString(),
    });
    expect(prisma.audits.at(-1)).toMatchObject({
      actorUserId: DAYANA.id,
      action: 'permission.override_approved',
      metadata: {
        capability: 'payments',
        holderId: ERNESTO.id,
        expiresAt: later(9).toISOString(),
      },
    });
    expect(await service.activeFor(ERNESTO.id, 'payments', later(8.9))).toEqual({
      id: asked.id,
    });
    expect(await service.activeFor(ERNESTO.id, 'payments', later(9))).toBeNull();
    expect(await service.activeFor(ERNESTO.id, 'catalog', later(2))).toBeNull();
  });

  it('lets only a Super Admin decide, once, and never a lapsed request', async () => {
    const asked = await ask();
    await expect(service.approve(ANA, asked.id, {}, NOW)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.approve(DAYANA, 'no-such-id', {}, NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await service.decline(DAYANA, asked.id, { note: 'Ana covers it' }, NOW);
    await expect(service.approve(DAYANA, asked.id, {}, NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.audits.at(-1)).toMatchObject({
      action: 'permission.override_declined',
    });

    const second = await ask();
    await expect(
      service.approve(DAYANA, second.id, {}, later(24)),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets the holder give it back or a Super Admin end it, but nobody else (O5)', async () => {
    const asked = await ask();
    await service.approve(DAYANA, asked.id, {}, NOW);
    await expect(service.end(ANA, asked.id, {}, later(1))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const ended = await service.end(ERNESTO, asked.id, {}, later(1));
    expect(ended).toMatchObject({ status: 'ENDED', endedByName: 'Ernesto Vila' });
    expect(prisma.audits.at(-1)).toMatchObject({
      action: 'permission.override_ended',
      metadata: { by: 'holder' },
    });
    expect(await service.activeFor(ERNESTO.id, 'payments', later(2))).toBeNull();
    await expect(service.end(DAYANA, asked.id, {}, later(2))).rejects.toBeInstanceOf(
      ConflictException,
    );
    // Once it has ended, the person may ask again.
    await expect(
      service.request(ERNESTO, { capability: 'payments', reason: 'Again' }, later(3)),
    ).resolves.toMatchObject({ status: 'REQUESTED' });
  });

  it('shows the person the rows they may ask for and their recent overrides', async () => {
    const asked = await ask();
    const mine = await service.mine(ERNESTO, later(1));
    expect(mine.overridable).toEqual([
      'bookings',
      'dispatch',
      'suppliers',
      'advisories',
      'disruptions',
      'payments',
      'catalog',
      'customers',
    ]);
    expect(mine.expiryHours).toBe(8);
    expect(mine.overrides.map((item) => [item.id, item.status])).toEqual([
      [asked.id, 'REQUESTED'],
    ]);
    expect((await service.mine(ANA, later(1))).overridable).toEqual([]);
  });

  it('splits Settings › Permissions into pending requests, running overrides and the rest', async () => {
    const pending = await ask();
    const running = await service.request(
      ERNESTO,
      { capability: 'catalog', reason: 'Price fix' },
      NOW,
    );
    await service.approve(DAYANA, running.id, {}, NOW);
    const declined = await service.request(
      ERNESTO,
      { capability: 'dispatch', reason: 'Night shift' },
      NOW,
    );
    await service.decline(DAYANA, declined.id, {}, NOW);
    const list = await service.list(later(1));
    expect(list.requests.map((item) => item.id)).toEqual([pending.id]);
    expect(list.active.map((item) => item.id)).toEqual([running.id]);
    expect(list.recent.map((item) => item.id)).toEqual([declined.id]);
  });
});

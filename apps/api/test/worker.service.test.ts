import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@ota/db';
import { WORKER_CODE_MAX_FAILURES, workerCodeSms } from '@ota/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { SmsChannel, SmsMessage } from '../src/sms/sms.channel';
import { SuppliersService } from '../src/suppliers/suppliers.service';
import type { ObjectStorage } from '@ota/storage';
import {
  WorkerCodesService,
  hashWorkerCode,
  workerCodeIdentifier,
} from '../src/worker/worker-codes.service';
import { WorkerService } from '../src/worker/worker.service';
import { fakeOperatingSettings } from './fixtures/operating-settings';

const NOW = new Date('2026-11-09T10:00:00Z');
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

const OPS: AuthUser = {
  id: 'u-ops',
  email: 'ops@example.test',
  role: 'OPERATIONS_ADMIN',
};

interface Supplier {
  id: string;
  userId: string;
  primaryPhone: string;
  role: string;
  deactivatedAt: Date | null;
}

interface Verification {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt: Date;
}

interface Session {
  id: string;
  userId: string;
  signInMethod: string | null;
}

function createFake(suppliers: Supplier[], sessions: Session[] = []) {
  const verifications: Verification[] = [];
  const audit: Array<Record<string, unknown>> = [];
  const matches = (row: Verification, where: { id?: string; value?: string }) =>
    (where.id === undefined || row.id === where.id) &&
    (where.value === undefined || row.value === where.value);
  const remove = (where: { id?: string; value?: string; identifier?: string }) => {
    let count = 0;
    for (let index = verifications.length - 1; index >= 0; index -= 1) {
      const row = verifications[index]!;
      if (
        matches(row, where) &&
        (where.identifier === undefined || row.identifier === where.identifier)
      ) {
        verifications.splice(index, 1);
        count += 1;
      }
    }
    return { count };
  };
  const prisma = {
    supplierProfile: {
      findMany: async ({ where }: { where: { primaryPhone: { contains: string } } }) =>
        suppliers
          .filter(
            (supplier) =>
              supplier.primaryPhone.includes(where.primaryPhone.contains) &&
              supplier.role === 'SERVICE_WORKER' &&
              supplier.deactivatedAt === null,
          )
          .map(({ userId, primaryPhone }) => ({ userId, primaryPhone })),
      findUnique: async ({ where }: { where: { id: string } }) => {
        const supplier = suppliers.find((candidate) => candidate.id === where.id);
        return supplier
          ? {
              primaryPhone: supplier.primaryPhone,
              user: {
                id: supplier.userId,
                role: supplier.role,
                deactivatedAt: supplier.deactivatedAt,
              },
            }
          : null;
      },
    },
    verification: {
      findFirst: async ({
        where,
      }: {
        where: { identifier: string; expiresAt: { gt: Date } };
      }) =>
        verifications
          .filter(
            (row) =>
              row.identifier === where.identifier &&
              row.expiresAt.getTime() > where.expiresAt.gt.getTime(),
          )
          .at(-1) ?? null,
      deleteMany: async ({ where }: { where: Record<string, string> }) => remove(where),
      create: async ({ data }: { data: Verification }) => {
        verifications.push({ ...data });
        return data;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; value: string };
        data: { value: string };
      }) => {
        const row = verifications.find((candidate) => matches(candidate, where));
        if (!row) return { count: 0 };
        row.value = data.value;
        return { count: 1 };
      },
    },
    session: {
      deleteMany: async ({
        where,
      }: {
        where: { userId: string; signInMethod: string };
      }) => {
        const ended = sessions.filter(
          (row) => row.userId === where.userId && row.signInMethod === where.signInMethod,
        );
        for (const row of ended) sessions.splice(sessions.indexOf(row), 1);
        return { count: ended.length };
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audit.push(data);
        return data;
      },
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  const sent: SmsMessage[] = [];
  const sms: SmsChannel = {
    delivers: false,
    send: async (message) => {
      sent.push(message);
    },
  };
  const service = new WorkerCodesService(prisma as unknown as PrismaService, sms);
  return { service, verifications, sessions, audit, sent };
}

const REINIER: Supplier = {
  id: 'supplier-reinier',
  userId: 'u-reinier',
  primaryPhone: '+53 5241 0088',
  role: 'SERVICE_WORKER',
  deactivatedAt: null,
};

/** The code in an SMS the fake channel captured. */
function codeIn(message: SmsMessage | undefined): string {
  const code = /\b(\d{6})\b/.exec(message?.body ?? '')?.[1];
  if (!code) throw new Error('No code in the SMS');
  return code;
}

describe('worker sign-in codes (docs/worker-app-plan.md W1)', () => {
  let fake: ReturnType<typeof createFake>;

  beforeEach(() => {
    fake = createFake([
      REINIER,
      {
        id: 'supplier-gone',
        userId: 'u-gone',
        primaryPhone: '52419988',
        role: 'SERVICE_WORKER',
        deactivatedAt: new Date('2026-10-01T00:00:00Z'),
      },
    ]);
  });

  it('texts a code to the worker with that number, storing only its hash', async () => {
    await fake.service.send({ phone: '5 241 0088' }, NOW);
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]!.to).toBe('+5352410088');
    const code = codeIn(fake.sent[0]);
    expect(fake.sent[0]!.body).toBe(workerCodeSms(code));
    expect(fake.verifications).toHaveLength(1);
    expect(fake.verifications[0]!.identifier).toBe(workerCodeIdentifier('u-reinier'));
    expect(fake.verifications[0]!.value).not.toContain(code);
    expect(JSON.parse(fake.verifications[0]!.value)).toMatchObject({
      hash: hashWorkerCode(code),
      failedAttempts: 0,
      via: 'sms',
    });
    expect(fake.audit).toEqual([
      expect.objectContaining({ action: 'auth.worker_code_sent', entityId: 'u-reinier' }),
    ]);
  });

  it('sends nothing for an unknown, deactivated or unreadable number', async () => {
    await fake.service.send({ phone: '52410077' }, NOW);
    await fake.service.send({ phone: '52419988' }, NOW);
    await fake.service.send({ phone: 'not a phone' }, NOW);
    expect(fake.sent).toHaveLength(0);
    expect(fake.verifications).toHaveLength(0);
  });

  it('sends nothing when two workers share the number', async () => {
    fake = createFake([REINIER, { ...REINIER, id: 'supplier-twin', userId: 'u-twin' }]);
    await fake.service.send({ phone: '52410088' }, NOW);
    expect(fake.sent).toHaveLength(0);
  });

  it('waits 45 seconds before texting another code, which replaces the first', async () => {
    await fake.service.send({ phone: '52410088' }, NOW);
    await fake.service.send({ phone: '52410088' }, later(30));
    expect(fake.sent).toHaveLength(1);
    await fake.service.send({ phone: '52410088' }, later(45));
    expect(fake.sent).toHaveLength(2);
    expect(fake.verifications).toHaveLength(1);
    expect(
      await fake.service.redeem(
        { phone: '52410088', code: codeIn(fake.sent[0]) },
        later(46),
      ),
    ).toBeNull();
    expect(
      await fake.service.redeem(
        { phone: '52410088', code: codeIn(fake.sent[1]) },
        later(47),
      ),
    ).toEqual({ userId: 'u-reinier', expiresAt: new Date('2026-12-09T10:00:47Z') });
  });

  it('signs the worker in once with the right code, for 30 days', async () => {
    await fake.service.send({ phone: '52410088' }, NOW);
    const code = codeIn(fake.sent[0]);
    expect(
      await fake.service.redeem({ phone: '+53 5241-0088', code: ` ${code} ` }, later(60)),
    ).toEqual({ userId: 'u-reinier', expiresAt: new Date('2026-12-09T10:01:00Z') });
    expect(fake.verifications).toHaveLength(0);
    expect(await fake.service.redeem({ phone: '52410088', code }, later(61))).toBeNull();
    expect(fake.audit.at(-1)).toMatchObject({
      action: 'auth.worker_code_used',
      metadata: { via: 'sms' },
    });
  });

  it('refuses a code after ten minutes', async () => {
    await fake.service.send({ phone: '52410088' }, NOW);
    const code = codeIn(fake.sent[0]);
    expect(await fake.service.redeem({ phone: '52410088', code }, later(600))).toBeNull();
  });

  it('refuses the right code typed with another number', async () => {
    await fake.service.send({ phone: '52410088' }, NOW);
    const code = codeIn(fake.sent[0]);
    expect(await fake.service.redeem({ phone: '52410077', code }, later(5))).toBeNull();
  });

  it('voids the open code on the fifth wrong try', async () => {
    await fake.service.send({ phone: '52410088' }, NOW);
    const code = codeIn(fake.sent[0]);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let attempt = 1; attempt < WORKER_CODE_MAX_FAILURES; attempt += 1) {
      expect(
        await fake.service.redeem({ phone: '52410088', code: wrong }, later(attempt)),
      ).toBeNull();
    }
    expect(JSON.parse(fake.verifications[0]!.value).failedAttempts).toBe(4);
    expect(
      await fake.service.redeem({ phone: '52410088', code: wrong }, later(10)),
    ).toBeNull();
    expect(fake.verifications).toHaveLength(0);
    expect(await fake.service.redeem({ phone: '52410088', code }, later(11))).toBeNull();
    expect(fake.audit.at(-1)).toMatchObject({
      action: 'auth.worker_code_voided',
      entityId: 'u-reinier',
    });
  });

  it('lets the desk issue a code to read out, shown once and audited', async () => {
    const issued = await fake.service.issue('supplier-reinier', OPS, NOW);
    expect(issued).toEqual({
      code: expect.stringMatching(/^\d{6}$/),
      expiresAt: '2026-11-09T10:10:00.000Z',
      phone: '+53 5 241 •• 88',
    });
    expect(fake.sent).toHaveLength(0);
    expect(fake.audit).toEqual([
      expect.objectContaining({
        actorUserId: 'u-ops',
        action: 'auth.worker_code_issued',
        entityId: 'u-reinier',
        metadata: { supplierId: 'supplier-reinier' },
      }),
    ]);
    expect(
      await fake.service.redeem({ phone: '52410088', code: issued.code }, later(5)),
    ).toMatchObject({ userId: 'u-reinier' });
    expect(fake.audit.at(-1)).toMatchObject({ metadata: { via: 'desk' } });
  });

  it('keeps a code the desk read out when the worker asks for an SMS', async () => {
    const issued = await fake.service.issue('supplier-reinier', OPS, NOW);
    await fake.service.send({ phone: '52410088' }, later(120));
    expect(fake.sent).toHaveLength(0);
    expect(
      await fake.service.redeem({ phone: '52410088', code: issued.code }, later(121)),
    ).toMatchObject({ userId: 'u-reinier' });
  });

  it('refuses to issue a code the worker could not use', async () => {
    await expect(fake.service.issue('missing', OPS, NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(fake.service.issue('supplier-gone', OPS, NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
    fake = createFake([{ ...REINIER, primaryPhone: 'ask at the casa' }]);
    await expect(fake.service.issue('supplier-reinier', OPS, NOW)).rejects.toMatchObject({
      response: { code: 'WORKER_PHONE_UNREADABLE' },
    });
  });
  it("lets the desk sign the worker's phones out and void their open code", async () => {
    fake = createFake(
      [REINIER],
      [
        { id: 'phone-1', userId: 'u-reinier', signInMethod: 'worker_code' },
        { id: 'phone-2', userId: 'u-reinier', signInMethod: 'worker_code' },
        { id: 'browser', userId: 'u-reinier', signInMethod: 'magic_link' },
        { id: 'other-worker', userId: 'u-other', signInMethod: 'worker_code' },
      ],
    );
    const issued = await fake.service.issue('supplier-reinier', OPS, NOW);

    expect(await fake.service.signOut('supplier-reinier', OPS)).toEqual({ sessions: 2 });
    expect(fake.sessions.map((row) => row.id)).toEqual(['browser', 'other-worker']);
    expect(fake.verifications).toHaveLength(0);
    expect(fake.audit.at(-1)).toMatchObject({
      actorUserId: 'u-ops',
      action: 'auth.worker_signed_out',
      entityId: 'u-reinier',
      metadata: { supplierId: 'supplier-reinier', sessions: 2, codes: 1 },
    });
    expect(
      await fake.service.redeem({ phone: '52410088', code: issued.code }, later(5)),
    ).toBeNull();
  });

  it('signs out a worker with no phone signed in, and refuses an unknown supplier', async () => {
    expect(await fake.service.signOut('supplier-reinier', OPS)).toEqual({ sessions: 0 });
    expect(fake.audit.at(-1)).toMatchObject({
      action: 'auth.worker_signed_out',
      metadata: { sessions: 0, codes: 0 },
    });
    await expect(fake.service.signOut('missing', OPS)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("the worker app's home (W-Home, W-Offer)", () => {
  const WORKER: AuthUser = {
    id: 'u-reinier',
    email: 'driver@example.test',
    role: 'SERVICE_WORKER',
    sessionId: 'session-1',
  };
  const ITEM = {
    serviceType: 'TRANSPORTATION',
    province: 'Pinar del Río',
    serviceDateStart: new Date('2026-11-13T15:40:00Z'),
    serviceDateEnd: new Date('2026-11-20T11:00:00Z'),
    payoutRate: new Prisma.Decimal(180),
    reservation: {
      bookingCode: 'VX7K2M9Q',
      partySize: 2,
      user: { fullName: 'Margaret  Chen', locale: 'en' },
    },
  };
  const calls: Array<{ where: Record<string, unknown> }> = [];
  const deleted: unknown[] = [];

  function home(
    profile: Record<string, unknown> | null,
    offers: unknown[],
    jobs: unknown[],
  ) {
    calls.length = 0;
    deleted.length = 0;
    const prisma = {
      supplierProfile: { findUnique: async () => profile },
      serviceItem: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          calls.push(args);
          return args.where.status === 'OFFERED' ? offers : jobs;
        },
      },
      dispatchOffer: {
        findMany: async () =>
          ['ACCEPTED', 'ACCEPTED', 'ACCEPTED', 'DECLINED', 'TIMEOUT', 'ACCEPTED'].map(
            (status) => ({
              supplierId: 'supplier-reinier',
              status,
              offeredAt: NOW,
              respondedAt: NOW,
            }),
          ),
      },
      session: {
        deleteMany: async (args: unknown) => {
          deleted.push(args);
          return { count: 1 };
        },
      },
    };
    return new WorkerService(
      prisma as unknown as PrismaService,
      fakeOperatingSettings({ amberPercent: 75 }),
      {} as SuppliersService,
    );
  }

  const PROFILE = {
    id: 'supplier-reinier',
    category: 'PRIVATE_DRIVER',
    provincesActive: ['La Habana'],
    verificationStatus: 'VERIFIED',
    credentialExpiresAt: new Date('2027-06-12T00:00:00Z'),
    user: { fullName: 'Reinier Sosa' },
  };

  it('shows the worker their own open offers and coming jobs, travelers by first name', async () => {
    const service = home(
      PROFILE,
      [
        {
          ...ITEM,
          id: 'item-offer',
          offeredAt: new Date('2026-11-09T09:00:00Z'),
          dispatchDeadline: new Date('2026-11-09T11:00:00Z'),
        },
      ],
      [{ ...ITEM, id: 'item-job', offeredAt: null, dispatchDeadline: null }],
    );
    const result = await service.home(WORKER, NOW);

    expect(calls.map((call) => call.where.supplierId)).toEqual([
      'supplier-reinier',
      'supplier-reinier',
    ]);
    expect(result.worker).toEqual({
      firstName: 'Reinier',
      category: 'PRIVATE_DRIVER',
      provinces: ['La Habana'],
      verificationStatus: 'VERIFIED',
      credentialExpiresAt: '2027-06-12T00:00:00.000Z',
      reliability: 67,
    });
    expect(result.offers).toEqual([
      {
        serviceItemId: 'item-offer',
        serviceType: 'TRANSPORTATION',
        province: 'Pinar del Río',
        startsAt: '2026-11-13T15:40:00.000Z',
        endsAt: '2026-11-20T11:00:00.000Z',
        bookingCode: 'VX7K2M9Q',
        payout: '180.00',
        currency: 'EUR',
        traveler: { firstName: 'Margaret', language: 'en', partySize: 2 },
        offeredAt: '2026-11-09T09:00:00.000Z',
        deadline: '2026-11-09T11:00:00.000Z',
        // 75 % of the two-hour window: the desk's amber.
        hurryFrom: '2026-11-09T10:30:00.000Z',
      },
    ]);
    expect(result.jobs.map((job) => job.serviceItemId)).toEqual(['item-job']);
    expect(result.serverTime).toBe(NOW.toISOString());
    expect(JSON.stringify(result)).not.toMatch(/Chen|@|userId/);
  });

  it('refuses a worker account with no supplier profile', async () => {
    await expect(home(null, [], []).home(WORKER, NOW)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('signs out only the session that asked', async () => {
    const service = home(PROFILE, [], []);
    await service.signOut(WORKER);
    expect(deleted).toEqual([{ where: { id: 'session-1', userId: 'u-reinier' } }]);
    await service.signOut({ ...WORKER, sessionId: undefined });
    expect(deleted).toHaveLength(1);
  });
});

describe("the worker app's calendar (W-Calendar)", () => {
  const WORKER: AuthUser = {
    id: 'u-reinier',
    email: 'driver@example.test',
    role: 'SERVICE_WORKER',
    sessionId: 'session-1',
  };
  const day = (value: string) => new Date(`${value}T00:00:00Z`);
  const ITEM = {
    serviceType: 'TRANSPORTATION',
    province: 'La Habana',
    payoutRate: new Prisma.Decimal(25),
    reservation: {
      bookingCode: 'VX7K2M9Q',
      partySize: 2,
      user: { fullName: 'Ingrid Berg', locale: 'en' },
    },
  };
  // 15:50 in Havana on the 13th; an offer for the 17th, open for two hours.
  const JOB = {
    ...ITEM,
    id: 'item-job',
    serviceDateStart: new Date('2026-11-13T20:50:00Z'),
    serviceDateEnd: new Date('2026-11-13T22:00:00Z'),
    offeredAt: null,
    dispatchDeadline: null,
  };
  const OFFER = {
    ...ITEM,
    id: 'item-offer',
    serviceDateStart: new Date('2026-11-17T15:00:00Z'),
    serviceDateEnd: new Date('2026-11-17T18:00:00Z'),
    offeredAt: new Date('2026-11-09T09:00:00Z'),
    dispatchDeadline: new Date('2026-11-09T11:00:00Z'),
  };

  interface Row {
    supplierId: string;
    date: Date;
    isAvailable: boolean;
    blockReason?: string | null;
  }

  function calendarFake(category: string | null, rows: Row[] = []) {
    const audit: Array<Record<string, unknown>> = [];
    const resources = new Map<string, Record<string, unknown>>();
    const profile =
      category === null
        ? null
        : { id: 'supplier-reinier', category, userId: 'u-reinier' };
    const inDates = (row: Row, where: { date?: { in?: Date[]; gte?: Date } }) =>
      (!where.date?.in || where.date.in.some((date) => +date === +row.date)) &&
      (!where.date?.gte || row.date >= where.date.gte);
    const prisma = {
      supplierProfile: {
        findUnique: async () =>
          profile && {
            ...profile,
            resources: resources.get(profile.id) ?? null,
          },
      },
      serviceItem: {
        findMany: async ({ where }: { where: { status: unknown } }) =>
          where.status === 'OFFERED' ? [OFFER] : [JOB],
      },
      availability: {
        findMany: async ({
          where,
        }: {
          where: { supplierId: string; isAvailable: boolean; date: { gte: Date } };
        }) =>
          rows.filter(
            (row) =>
              row.supplierId === where.supplierId &&
              row.isAvailable === where.isAvailable &&
              inDates(row, where),
          ),
        updateMany: async ({
          where,
          data,
        }: {
          where: { supplierId: string; date: { in: Date[] } };
          data: { isAvailable: boolean; blockReason: string | null };
        }) => {
          const hit = rows.filter(
            (row) => row.supplierId === where.supplierId && inDates(row, where),
          );
          for (const row of hit) Object.assign(row, data);
          return { count: hit.length };
        },
        createMany: async ({ data }: { data: Row[]; skipDuplicates: boolean }) => {
          const fresh = data.filter(
            (row) =>
              !rows.some(
                (existing) =>
                  existing.supplierId === row.supplierId && +existing.date === +row.date,
              ),
          );
          rows.push(...fresh.map((row) => ({ ...row })));
          return { count: fresh.length };
        },
      },
      supplierResources: {
        upsert: async ({
          where,
          create,
        }: {
          where: { supplierId: string };
          create: Record<string, unknown>;
        }) => {
          resources.set(where.supplierId, { ...create });
          return create;
        },
        findUnique: async ({ where }: { where: { supplierId: string } }) =>
          resources.get(where.supplierId) ?? null,
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          audit.push(data);
          return data;
        },
      },
      $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
    };
    const settings = fakeOperatingSettings({ amberPercent: 75 });
    const suppliers = new SuppliersService(
      prisma as unknown as PrismaService,
      {} as ObjectStorage,
      settings,
    );
    const service = new WorkerService(
      prisma as unknown as PrismaService,
      settings,
      suppliers,
    );
    return { service, rows, audit, resources };
  }

  const blocked = (value: string): Row => ({
    supplierId: 'supplier-reinier',
    date: day(value),
    isAvailable: false,
  });

  it('shows the month’s days with the job, the open offer and the blocks, defaulting to this month', async () => {
    const fake = calendarFake('TOUR_GUIDE', [
      blocked('2026-11-11'),
      blocked('2026-11-13'),
      { supplierId: 'supplier-reinier', date: day('2026-11-12'), isAvailable: true },
      { ...blocked('2026-11-11'), supplierId: 'someone-else' },
    ]);
    const result = await fake.service.calendar(WORKER, {}, NOW);

    expect(result.month).toBe('2026-11');
    expect(result.today).toBe('2026-11-09');
    expect(result.horizon).toBe('2027-11-30');
    expect(result.days).toHaveLength(30);
    const state = (date: string) =>
      result.days.find((entry) => entry.date === date)?.state;
    expect(state('2026-11-11')).toBe('BLOCKED');
    expect(state('2026-11-12')).toBe('AVAILABLE');
    // A blocked day with a job shows the job.
    expect(state('2026-11-13')).toBe('JOB');
    expect(state('2026-11-17')).toBe('OFFER');
    expect(result.jobs.map((job) => job.serviceItemId)).toEqual(['item-job']);
    expect(result.offers[0]).toMatchObject({
      serviceItemId: 'item-offer',
      hurryFrom: '2026-11-09T10:30:00.000Z',
    });
    expect(result.longBlock).toBeNull();
    // Only drivers declare fuel.
    expect(result.fuel).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/Berg|@/);
  });

  it('shows a driver their fuel reserve, stale until declared', async () => {
    const fake = calendarFake('PRIVATE_DRIVER');
    expect((await fake.service.calendar(WORKER, { month: '2026-12' }, NOW)).fuel).toEqual(
      {
        litres: null,
        declaredAt: null,
        stale: true,
      },
    );
    await fake.service.declareFuel(WORKER, { litres: 40 }, NOW);
    // The desk's write stamps the real clock, so a week on is read from it.
    const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const fuel = (await fake.service.calendar(WORKER, {}, NOW)).fuel;
    expect(fuel).toMatchObject({ litres: 40, stale: false });
    expect((await fake.service.calendar(WORKER, {}, later)).fuel?.stale).toBe(true);
  });

  it('blocks a range but leaves the days with a job or an open offer, audited once as the worker app', async () => {
    const fake = calendarFake('TOUR_GUIDE', [
      { supplierId: 'supplier-reinier', date: day('2026-11-12'), isAvailable: true },
    ]);
    const result = await fake.service.setDays(
      WORKER,
      { from: '2026-11-12', to: '2026-11-18', isAvailable: false },
      NOW,
    );

    expect(result.kept).toEqual(['2026-11-13', '2026-11-17']);
    expect(result.changed).toEqual([
      '2026-11-12',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-18',
    ]);
    // Blocked without a reason picked: "Otro" (K2).
    expect(
      fake.rows.filter((row) => !row.isAvailable && row.blockReason === 'OTHER'),
    ).toHaveLength(5);
    // The existing row was updated, not duplicated.
    expect(fake.rows).toHaveLength(5);
    expect(fake.audit).toEqual([
      expect.objectContaining({
        actorUserId: 'u-reinier',
        action: 'supplier.availability_set',
        entityId: 'supplier-reinier',
        metadata: {
          from: '2026-11-12',
          to: '2026-11-18',
          isAvailable: false,
          reason: 'OTHER',
          days: result.changed,
          via: 'WORKER_APP',
        },
      }),
    ]);
  });

  it('frees a blocked day again and forgets why it was blocked, whatever reason is sent', async () => {
    const fake = calendarFake('TOUR_GUIDE', [
      { ...blocked('2026-11-20'), blockReason: 'FAMILY' },
    ]);
    const result = await fake.service.setDays(
      WORKER,
      { from: '2026-11-20', to: '2026-11-20', isAvailable: true, reason: 'OTHER_JOB' },
      NOW,
    );
    expect(result.changed).toEqual(['2026-11-20']);
    expect(fake.rows).toEqual([
      {
        supplierId: 'supplier-reinier',
        date: day('2026-11-20'),
        isAvailable: true,
        blockReason: null,
      },
    ]);
    expect(fake.audit[0]?.metadata).toMatchObject({ isAvailable: true, reason: null });
  });

  it('stores the reason picked on every day of a range, changing an earlier reason, and shows it on blocked days only', async () => {
    const fake = calendarFake('TOUR_GUIDE', [
      { ...blocked('2026-11-12'), blockReason: 'FAMILY' },
      // Blocked under the job's day, which shows the job and no reason.
      { ...blocked('2026-11-13'), blockReason: 'FAMILY' },
    ]);
    await fake.service.setDays(
      WORKER,
      { from: '2026-11-12', to: '2026-11-14', isAvailable: false, reason: 'VEHICLE_REPAIR' },
      NOW,
    );
    expect(fake.audit[0]?.metadata).toMatchObject({ reason: 'VEHICLE_REPAIR' });
    expect(
      fake.rows.map((row) => [row.date.toISOString().slice(0, 10), row.blockReason]),
    ).toEqual([
      ['2026-11-12', 'VEHICLE_REPAIR'],
      // The job's day is left as it was.
      ['2026-11-13', 'FAMILY'],
      ['2026-11-14', 'VEHICLE_REPAIR'],
    ]);

    const calendar = await fake.service.calendar(WORKER, {}, NOW);
    const entry = (date: string) => calendar.days.find((item) => item.date === date);
    expect(entry('2026-11-12')).toEqual({
      date: '2026-11-12',
      state: 'BLOCKED',
      reason: 'VEHICLE_REPAIR',
    });
    expect(entry('2026-11-13')).toMatchObject({ state: 'JOB', reason: null });
    expect(entry('2026-11-15')).toMatchObject({ state: 'AVAILABLE', reason: null });
  });

  it('shows a day blocked with no reason (by the desk, or before the reasons) without one', async () => {
    const fake = calendarFake('TOUR_GUIDE', [blocked('2026-11-20')]);
    const calendar = await fake.service.calendar(WORKER, {}, NOW);
    expect(calendar.days.find((item) => item.date === '2026-11-20')).toEqual({
      date: '2026-11-20',
      state: 'BLOCKED',
      reason: null,
    });
  });

  it('reports a block of more than fourteen days in a row', async () => {
    const fake = calendarFake('TOUR_GUIDE');
    const result = await fake.service.setDays(
      WORKER,
      { from: '2026-11-20', to: '2026-12-05', isAvailable: false },
      NOW,
    );
    expect(result.longBlock).toEqual({ from: '2026-11-20', to: '2026-12-05', days: 16 });
  });

  it('refuses a past day, a range over two months and a day past the horizon, writing nothing', async () => {
    const fake = calendarFake('TOUR_GUIDE');
    for (const range of [
      { from: '2026-11-08', to: '2026-11-10' },
      { from: '2026-11-20', to: '2027-01-21' },
      { from: '2027-11-30', to: '2027-12-01' },
      { from: '2026-11-20', to: '2026-11-19' },
    ]) {
      await expect(
        fake.service.setDays(WORKER, { ...range, isAvailable: false }, NOW),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
    expect(fake.rows).toEqual([]);
    expect(fake.audit).toEqual([]);
  });

  it('records a driver’s fuel through the desk’s resources path, as the worker app', async () => {
    const fake = calendarFake('PRIVATE_DRIVER');
    const fuel = await fake.service.declareFuel(WORKER, { litres: 35 }, NOW);

    expect(fuel).toMatchObject({ litres: 35, stale: false });
    expect(fake.resources.get('supplier-reinier')).toMatchObject({
      fuelReserveLitres: 35,
      generator: null,
      confirmedById: 'u-reinier',
      confirmedVia: 'WORKER_APP',
    });
    expect(fake.audit).toEqual([
      expect.objectContaining({
        action: 'supplier.resources_confirmed',
        metadata: expect.objectContaining({
          via: 'WORKER_APP',
          previous: null,
          next: expect.objectContaining({ fuelReserveLitres: 35 }),
        }),
      }),
    ]);
  });

  it('refuses fuel from a worker who is not a driver, and the calendar to an account with no profile', async () => {
    const guide = calendarFake('HOMESTAY_HOST');
    await expect(
      guide.service.declareFuel(WORKER, { litres: 10 }, NOW),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(guide.resources.size).toBe(0);
    await expect(
      calendarFake(null).service.calendar(WORKER, {}, NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

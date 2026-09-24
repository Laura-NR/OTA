import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Mailer } from '@ota/email';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { MAILER } from '../src/email/email.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { signRetentionToken } from '../src/retention/retention-token';

process.env.AUTH_SECRET ??= 'retention-test-secret-0123456789';

const SUPER_ADMIN = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@example.test',
  role: 'SUPER_ADMIN',
};
const TRAVELER_ID = '33333333-3333-4333-8333-333333333333';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

interface FakeUser {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  phone: string | null;
  image: string | null;
  nationality: string | null;
  retentionNoticeSentAt: Date | null;
  retentionConsentGrantedAt: Date | null;
  anonymizedAt: Date | null;
}

interface RetentionState {
  users: FakeUser[];
  completions: { userId: string; _max: { completedAt: Date | null } }[];
  audits: { action: string; entityId: string | null }[];
  deleted: { sessions: string[]; accounts: string[]; passkeys: string[] };
}

function makeUser(overrides: Partial<FakeUser> = {}): FakeUser {
  return {
    id: TRAVELER_ID,
    email: 'traveler@example.test',
    fullName: 'Example Traveler',
    role: 'TRAVELER',
    phone: '+53 5555 0000',
    image: null,
    nationality: 'ES',
    retentionNoticeSentAt: null,
    retentionConsentGrantedAt: null,
    anonymizedAt: null,
    ...overrides,
  };
}

function createFakePrisma(state: RetentionState) {
  const prisma: Record<string, unknown> = {
    reservation: {
      groupBy: async () => state.completions,
    },
    user: {
      findUnique: async (args: { where: { id: string } }) =>
        state.users.find((user) => user.id === args.where.id) ?? null,
      findMany: async (args: { where?: Record<string, unknown> }) => {
        const where = args.where ?? {};
        return state.users.filter((user) => {
          if (where.role && user.role !== where.role) {
            return false;
          }
          if (where.anonymizedAt === null && user.anonymizedAt !== null) {
            return false;
          }
          const notice = where.retentionNoticeSentAt as { not?: unknown } | undefined;
          if (notice && notice.not === null && user.retentionNoticeSentAt === null) {
            return false;
          }
          return true;
        });
      },
      update: async (args: { where: { id: string }; data: Partial<FakeUser> }) => {
        const user = state.users.find((row) => row.id === args.where.id);
        if (!user) throw new Error('user not found');
        Object.assign(user, args.data);
        return user;
      },
    },
    session: {
      deleteMany: async (args: { where: { userId: string } }) => {
        state.deleted.sessions.push(args.where.userId);
        return { count: 1 };
      },
    },
    account: {
      deleteMany: async (args: { where: { userId: string } }) => {
        state.deleted.accounts.push(args.where.userId);
        return { count: 1 };
      },
    },
    passkey: {
      deleteMany: async (args: { where: { userId: string } }) => {
        state.deleted.passkeys.push(args.where.userId);
        return { count: 1 };
      },
    },
    auditLog: {
      create: async (args: { data: { action: string; entityId: string | null } }) => {
        state.audits.push({
          action: args.data.action,
          entityId: args.data.entityId,
        });
        return args.data;
      },
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
  };
  return prisma;
}

const fakeAuthService = {
  getSession: async (headers: Record<string, string | string[] | undefined>) => {
    if (headers['x-test-user'] !== SUPER_ADMIN.email) return null;
    return {
      user: {
        id: SUPER_ADMIN.id,
        email: SUPER_ADMIN.email,
        role: SUPER_ADMIN.role,
      },
      session: { id: 'session-1', userId: SUPER_ADMIN.id, expiresAt: new Date() },
    };
  },
};

describe('retention API', () => {
  let app: INestApplication;
  let state: RetentionState;
  let mailer: { send: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    state = {
      users: [makeUser()],
      completions: [
        {
          userId: TRAVELER_ID,
          _max: { completedAt: new Date(now - 200 * DAY_MS) },
        },
      ],
      audits: [],
      deleted: { sessions: [], accounts: [], passkeys: [] },
    };
    mailer = { send: vi.fn(async () => undefined) };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma(state))
      .overrideProvider(AuthService)
      .useValue(fakeAuthService)
      .overrideProvider(MAILER)
      .useValue(mailer as unknown as Mailer)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('sends the keep-alive notice six months after completion and audits it', async () => {
    const response = await request(app.getHttpServer())
      .post('/retention/scan')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ noticed: 1, purged: 0 });
    expect(mailer.send).toHaveBeenCalledTimes(1);
    const email = mailer.send.mock.calls[0][0] as {
      to: string;
      subject: string;
      html: string;
    };
    expect(email.to).toBe('traveler@example.test');
    expect(email.subject).toContain('Keep your');
    expect(email.html).toContain('/retention/keep-alive?token=');
    expect(state.users[0].retentionNoticeSentAt).not.toBeNull();
    expect(state.audits.map((entry) => entry.action)).toContain('retention.notice_sent');
  });

  it('does not notify before six months have elapsed', async () => {
    state.completions = [
      { userId: TRAVELER_ID, _max: { completedAt: new Date(now - 30 * DAY_MS) } },
    ];

    const response = await request(app.getHttpServer())
      .post('/retention/scan')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.body).toEqual({ noticed: 0, purged: 0 });
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('anonymizes a traveler after the grace period and revokes credentials', async () => {
    state.users = [makeUser({ retentionNoticeSentAt: new Date(now - 31 * DAY_MS) })];

    const response = await request(app.getHttpServer())
      .post('/retention/scan')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.body).toEqual({ noticed: 0, purged: 1 });
    const user = state.users[0];
    expect(user.email).toBe(`anonymized+${TRAVELER_ID}@anonymized.invalid`);
    expect(user.fullName).toBeNull();
    expect(user.phone).toBeNull();
    expect(user.nationality).toBeNull();
    expect(user.anonymizedAt).not.toBeNull();
    expect(state.deleted).toEqual({
      sessions: [TRAVELER_ID],
      accounts: [TRAVELER_ID],
      passkeys: [TRAVELER_ID],
    });
    expect(state.audits.map((entry) => entry.action)).toContain('retention.anonymized');
    // The completion anchor and reservations are preserved for fiscal reporting.
    expect(state.completions).toHaveLength(1);
  });

  it('keeps the account when the traveler confirms via the keep-alive link', async () => {
    state.users = [makeUser({ retentionNoticeSentAt: new Date(now - 10 * DAY_MS) })];
    const token = signRetentionToken({
      userId: TRAVELER_ID,
      expiresAt: new Date(now + 20 * DAY_MS),
      secret: process.env.AUTH_SECRET!,
    });

    const response = await request(app.getHttpServer()).get(
      `/retention/keep-alive?token=${encodeURIComponent(token)}`,
    );

    expect(response.status).toBe(200);
    expect(response.text).toContain('stay active');
    expect(state.users[0].retentionConsentGrantedAt).not.toBeNull();
    expect(state.audits.map((entry) => entry.action)).toContain(
      'retention.consent_granted',
    );

    const scan = await request(app.getHttpServer())
      .post('/retention/scan')
      .set('x-test-user', SUPER_ADMIN.email);
    expect(scan.body).toEqual({ noticed: 0, purged: 0 });
  });

  it('lists pending retention records for operations', async () => {
    state.users = [makeUser({ retentionNoticeSentAt: new Date(now - 10 * DAY_MS) })];

    const response = await request(app.getHttpServer())
      .get('/retention/pending')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      userId: TRAVELER_ID,
      status: 'GRACE_PERIOD',
    });
    expect(response.body[0].purgeAt).not.toBeNull();
  });
});

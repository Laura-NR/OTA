import type { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthSession } from '@ota/auth';
import { DEFAULT_OPERATING_THRESHOLDS } from '@ota/domain';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { dropRefusedSockets } from '../src/auth/socket-recheck';
import { PrismaService } from '../src/prisma/prisma.service';
import { OperatingSettingsService } from '../src/settings/operating-settings.service';
import {
  fakeOperatingSettings,
  withNoSettingsVersion,
} from './fixtures/operating-settings';
import { fakeSessionPolicy } from './fixtures/session-policy';

const MINUTE = 60 * 1000;
const USER_ID = '22222222-2222-4222-8222-222222222222';

interface SessionRow {
  id: string;
  userId: string;
  createdAt: Date;
  lastActiveAt: Date | null;
  ownDevice: boolean;
}

/**
 * The desk's idle lock at the guard and its routes
 * (`docs/schema-m9-idle-lock.md` L1–L3, L5, L6): a staff session with no
 * reported input for the applied limit is refused everywhere with
 * `SESSION_LOCKED`, and only an unlocked session can report input or mark
 * its own device.
 */
describe('the desk idle lock (guard, /me/session, /me/activity)', () => {
  let app: INestApplication;
  let role: string;
  let row: SessionRow;
  let minutes: number;
  let audits: Record<string, unknown>[];

  const ago = (n: number) => new Date(Date.now() - n * MINUTE);

  beforeAll(async () => {
    const settings = Object.assign(fakeOperatingSettings(), {
      thresholds: async () => ({
        ...DEFAULT_OPERATING_THRESHOLDS,
        staffIdleLockMinutes: minutes,
      }),
    });
    const select = (current: SessionRow) => ({
      userId: current.userId,
      createdAt: current.createdAt,
      lastActiveAt: current.lastActiveAt,
      ownDevice: current.ownDevice,
    });
    const prisma = withNoSettingsVersion({
      passkey: { count: async () => 0, findMany: async () => [] },
      session: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === row.id ? select(row) : null,
        update: async ({ data }: { data: Partial<SessionRow> }) => {
          row = { ...row, ...data };
          return select(row);
        },
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          audits.push(data);
          return data;
        },
      },
    });
    Object.assign(prisma, {
      $transaction: async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(OperatingSettingsService)
      .useValue(settings)
      .overrideProvider(AuthService)
      .useValue({
        getSession: async () => ({
          user: { id: USER_ID, email: 'ana@vereda.travel', role, deactivatedAt: null },
          session: {
            id: row.id,
            userId: USER_ID,
            createdAt: row.createdAt,
            signInMethod: 'passkey',
            lastActiveAt: row.lastActiveAt,
            ownDevice: row.ownDevice,
          },
        }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    role = 'OPERATIONS_ADMIN';
    minutes = 30;
    audits = [];
    row = {
      id: 's-1',
      userId: USER_ID,
      createdAt: ago(60),
      lastActiveAt: ago(5),
      ownDevice: false,
    };
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a staff session whose last input is inside the limit', async () => {
    const response = await request(app.getHttpServer()).get('/me/session').expect(200);
    expect(response.body).toMatchObject({
      userId: USER_ID,
      ownDevice: false,
      idleLockMinutes: 30,
      lastActiveAt: row.lastActiveAt?.toISOString(),
    });
  });

  it('refuses a staff session idle past the limit with SESSION_LOCKED, on every route', async () => {
    row.lastActiveAt = ago(31);
    for (const path of ['/me/session', '/reservations', '/me/passkeys']) {
      const response = await request(app.getHttpServer()).get(path).expect(401);
      expect(response.body.code).toBe('SESSION_LOCKED');
    }
  });

  it('counts from sign-in when the desk never reported input', async () => {
    row.lastActiveAt = null;
    const response = await request(app.getHttpServer()).get('/me/session').expect(401);
    expect(response.body.code).toBe('SESSION_LOCKED');
  });

  it('follows the applied limit', async () => {
    minutes = 5;
    row.lastActiveAt = ago(6);
    await request(app.getHttpServer()).get('/me/session').expect(401);
    minutes = 240;
    row.lastActiveAt = ago(200);
    await request(app.getHttpServer()).get('/me/session').expect(200);
  });

  it('never locks an own-device session, and says so', async () => {
    row.ownDevice = true;
    row.lastActiveAt = ago(600);
    const response = await request(app.getHttpServer()).get('/me/session').expect(200);
    expect(response.body).toMatchObject({ ownDevice: true, idleLockMinutes: null });
  });

  it('never locks a traveler', async () => {
    role = 'TRAVELER';
    row.lastActiveAt = ago(600);
    await request(app.getHttpServer()).get('/me/passkeys').expect(200);
  });

  it('restarts the clock on a reported input, by the server’s time', async () => {
    const before = Date.now();
    const response = await request(app.getHttpServer()).post('/me/activity').expect(200);
    expect(new Date(response.body.lastActiveAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(row.lastActiveAt!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('cannot be unlocked by reporting input', async () => {
    const stale = ago(31);
    row.lastActiveAt = stale;
    const response = await request(app.getHttpServer()).post('/me/activity').expect(401);
    expect(response.body.code).toBe('SESSION_LOCKED');
    expect(row.lastActiveAt).toBe(stale);
  });

  it('marks its own device at sign-in, audited', async () => {
    row.createdAt = ago(1);
    row.lastActiveAt = null;
    const response = await request(app.getHttpServer())
      .post('/me/session/own-device')
      .expect(200);
    expect(response.body).toMatchObject({ ownDevice: true, idleLockMinutes: null });
    expect(audits).toEqual([
      expect.objectContaining({
        action: 'auth.session_own_device',
        entityId: USER_ID,
        metadata: { sessionId: 's-1' },
      }),
    ]);
  });

  it('refuses the own-device mark later in the session', async () => {
    row.createdAt = ago(11);
    await request(app.getHttpServer()).post('/me/session/own-device').expect(409);
    expect(row.ownDevice).toBe(false);
    expect(audits).toEqual([]);
  });

  it('refuses the own-device mark from a locked session', async () => {
    row.createdAt = ago(40);
    row.lastActiveAt = null;
    await request(app.getHttpServer()).post('/me/session/own-device').expect(401);
    expect(row.ownDevice).toBe(false);
  });
});

describe('SessionPolicy: what a locked session may still do (L5)', () => {
  const now = new Date('2026-10-31T12:00:00Z');
  const session = (
    overrides: Partial<AuthSession['session']> = {},
    user: Partial<AuthSession['user']> = {},
  ): AuthSession => ({
    user: { id: USER_ID, email: 'ana@vereda.travel', role: 'SUPER_ADMIN', ...user },
    session: {
      id: 's-1',
      userId: USER_ID,
      expiresAt: new Date(now.getTime() + 60 * MINUTE),
      createdAt: new Date(now.getTime() - 60 * MINUTE),
      signInMethod: 'magic_link',
      lastActiveAt: new Date(now.getTime() - 31 * MINUTE),
      ownDevice: false,
      ...overrides,
    },
  });

  it('refuses Better Auth’s session routes to a locked desk', async () => {
    expect(await fakeSessionPolicy().gateRefusal(session(), now)).toEqual({
      code: 'SESSION_LOCKED',
      message: expect.any(String),
    });
  });

  it('refuses them to a deactivated account', async () => {
    expect(
      await fakeSessionPolicy().gateRefusal(
        session({ lastActiveAt: now }, { deactivatedAt: now }),
        now,
      ),
    ).toMatchObject({ code: 'SESSION_REFUSED' });
  });

  it('leaves the passkey rule out, so a setup-only session can still enroll', async () => {
    const policy = fakeSessionPolicy({ required: true, passkeys: 0 });
    expect(await policy.gateRefusal(session({ lastActiveAt: now }), now)).toBeNull();
    expect((await policy.refusal(session({ lastActiveAt: now }), now))?.kind).toBe(
      'enroll',
    );
  });

  it('locks before the passkey rule is asked', async () => {
    const policy = fakeSessionPolicy({ required: true, passkeys: 1 });
    expect((await policy.refusal(session(), now))?.kind).toBe('locked');
  });
});

describe('the gateways drop sockets whose session is refused later (L5)', () => {
  it('disconnects a locked socket and keeps a live one', async () => {
    const fresh = new Date(Date.now() - MINUTE);
    const sessions: Record<string, AuthSession> = {
      live: {
        user: { id: USER_ID, email: 'ana@vereda.travel', role: 'OPERATIONS_ADMIN' },
        session: {
          id: 's-live',
          userId: USER_ID,
          expiresAt: new Date(Date.now() + 60 * MINUTE),
          createdAt: fresh,
          lastActiveAt: fresh,
        },
      },
      locked: {
        user: { id: USER_ID, email: 'ana@vereda.travel', role: 'OPERATIONS_ADMIN' },
        session: {
          id: 's-locked',
          userId: USER_ID,
          expiresAt: new Date(Date.now() + 60 * MINUTE),
          createdAt: new Date(Date.now() - 90 * MINUTE),
          lastActiveAt: new Date(Date.now() - 45 * MINUTE),
        },
      },
    };
    const dropped: string[] = [];
    const socket = (name: string) => ({
      handshake: { headers: { 'x-session': name } },
      disconnect: () => {
        dropped.push(name);
      },
    });
    const server = {
      fetchSockets: async () => [socket('live'), socket('locked'), socket('gone')],
    };
    const auth = {
      getSession: async (headers: Record<string, string>) =>
        sessions[headers['x-session']!] ?? null,
    } as unknown as AuthService;
    const logger = { warn: () => undefined } as unknown as Logger;

    await dropRefusedSockets(server as never, auth, fakeSessionPolicy(), logger);
    expect(dropped).toEqual(['locked', 'gone']);
  });
});

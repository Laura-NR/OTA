import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DEFAULT_OPERATING_THRESHOLDS } from '@ota/domain';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { withNoSettingsVersion } from './fixtures/operating-settings';

const HOUR = 3_600_000;

interface FakeSession {
  role: string;
  signedInHoursAgo: number;
  deactivated?: boolean;
  ipAddress?: string;
}

const SESSIONS: Record<string, FakeSession> = {
  'ops@example.test': { role: 'OPERATIONS_ADMIN', signedInHoursAgo: 2 },
  'ops-old@example.test': { role: 'OPERATIONS_ADMIN', signedInHoursAgo: 13 },
  'gone@example.test': {
    role: 'OPERATIONS_ADMIN',
    signedInHoursAgo: 1,
    deactivated: true,
  },
  'traveler-old@example.test': { role: 'TRAVELER', signedInHoursAgo: 100 },
  'super-office@example.test': {
    role: 'SUPER_ADMIN',
    signedInHoursAgo: 1,
    ipAddress: '203.0.113.9',
  },
  'super-cafe@example.test': {
    role: 'SUPER_ADMIN',
    signedInHoursAgo: 1,
    ipAddress: '198.51.100.7',
  },
  'ops-cafe@example.test': {
    role: 'OPERATIONS_ADMIN',
    signedInHoursAgo: 1,
    ipAddress: '198.51.100.7',
  },
};

/** Sessions as Better Auth returns them, with the M9 fields the guard reads. */
const fakeAuthService = {
  getSession: async (headers: Record<string, string | string[] | undefined>) => {
    const email = String(headers['x-test-user'] ?? '');
    const session = SESSIONS[email];
    if (!session) return null;
    return {
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email,
        role: session.role,
        deactivatedAt: session.deactivated ? new Date() : null,
      },
      session: {
        id: 'session-1',
        userId: '11111111-1111-4111-8111-111111111111',
        expiresAt: new Date(Date.now() + 7 * 24 * HOUR),
        createdAt: new Date(Date.now() - session.signedInHoursAgo * HOUR),
        // A desk in use, so the idle lock (docs/schema-m9-idle-lock.md) stays out of it.
        lastActiveAt: new Date(),
        ipAddress: session.ipAddress ?? '127.0.0.1',
      },
    };
  },
};

describe('auth guard (M9 D5, D9)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(withNoSettingsVersion({}))
      .overrideProvider(AuthService)
      .useValue(fakeAuthService)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (email: string) =>
    request(app.getHttpServer()).get('/settings/operating').set('x-test-user', email);

  it('lets a staff session through within 12 hours of sign-in', async () => {
    expect((await get('ops@example.test')).status).toBe(200);
  });

  it('ends a staff session 12 hours after sign-in', async () => {
    const response = await get('ops-old@example.test');
    expect(response.status).toBe(401);
    expect(response.body.message).toContain('sign in again');
  });

  it('refuses a deactivated user', async () => {
    const response = await get('gone@example.test');
    expect(response.status).toBe(401);
    expect(response.body.message).toContain('deactivated');
  });

  it('keeps an old traveler session (authenticated, then refused by role only)', async () => {
    expect((await get('traveler-old@example.test')).status).toBe(403);
  });
});

describe('auth guard: the Super Admin IP allowlist (docs/schema-m9-ip-allowlist.md I3)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const applied = {
      id: '22222222-2222-4222-8222-222222222222',
      version: 1,
      status: 'APPLIED',
      values: {
        ...DEFAULT_OPERATING_THRESHOLDS,
        superAdminIpAllowlistOn: true,
        superAdminIpAllowlist: [{ label: 'Havana office', cidr: '203.0.113.0/24' }],
      },
      decidedAt: new Date(),
      decidedBy: null,
    };
    const prisma = withNoSettingsVersion({});
    prisma.operatingSettings.findFirst = (async (query?: {
      where?: { status?: string };
    }) => (query?.where?.status === 'APPLIED' ? applied : null)) as never;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AuthService)
      .useValue(fakeAuthService)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (email: string) =>
    request(app.getHttpServer()).get('/settings/operating').set('x-test-user', email);

  it('refuses a Super Admin session signed in from outside the list with 403 IP_NOT_ALLOWED', async () => {
    const response = await get('super-cafe@example.test');
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'IP_NOT_ALLOWED',
      ipAddress: '198.51.100.7',
    });
    expect(response.body.message).toContain('198.51.100.7');
  });

  it('lets a Super Admin from a listed address through, and names their address', async () => {
    const response = await get('super-office@example.test');
    expect(response.status).toBe(200);
    expect(response.body.signInAddress).toBe('203.0.113.9');
  });

  it('never refuses another role from the same address', async () => {
    expect((await get('ops-cafe@example.test')).status).toBe(200);
  });
});

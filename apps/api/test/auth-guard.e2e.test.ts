import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

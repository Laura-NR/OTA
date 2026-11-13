import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DEFAULT_OPERATING_THRESHOLDS } from '@ota/domain';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { OperatingSettingsService } from '../src/settings/operating-settings.service';
import {
  fakeOperatingSettings,
  withNoSettingsVersion,
} from './fixtures/operating-settings';

/**
 * The staff passkey rule at the guard (`docs/schema-m9-passkeys.md` P1–P3,
 * P5): with the switch on, a staff session must come from a passkey; one
 * with no passkey yet reaches only its own account routes.
 */
describe('the staff passkey rule (guard, GET /me/passkeys)', () => {
  let app: INestApplication;
  let role: string;
  let signInMethod: string | null;
  let passkeys: { id: string; name: string | null }[];
  let required: boolean;
  const previousOverride = process.env.STAFF_PASSKEYS_OVERRIDE;

  beforeAll(async () => {
    const settings = Object.assign(fakeOperatingSettings(), {
      thresholds: async () => ({
        ...DEFAULT_OPERATING_THRESHOLDS,
        staffPasskeysRequired: required,
      }),
      overview: async () => ({ version: 0 }),
    });
    const prisma = withNoSettingsVersion({
      passkey: {
        count: async () => passkeys.length,
        findMany: async () =>
          passkeys.map((passkey) => ({
            ...passkey,
            createdAt: new Date('2026-10-26T09:00:00Z'),
            deviceType: 'multiDevice',
            backedUp: true,
          })),
      },
      user: {
        findUnique: async () => ({
          id: 'u-1',
          email: 'ana@vereda.travel',
          fullName: 'Ana',
        }),
      },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(OperatingSettingsService)
      .useValue(settings)
      .overrideProvider(AuthService)
      .useValue({
        getSession: async () => ({
          user: { id: 'u-1', email: 'ana@vereda.travel', role, deactivatedAt: null },
          session: { id: 's-1', userId: 'u-1', createdAt: new Date(), signInMethod },
        }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    role = 'OPERATIONS_ADMIN';
    signInMethod = 'magic_link';
    passkeys = [];
    required = true;
    delete process.env.STAFF_PASSKEYS_OVERRIDE;
  });

  afterAll(async () => {
    if (previousOverride === undefined) delete process.env.STAFF_PASSKEYS_OVERRIDE;
    else process.env.STAFF_PASSKEYS_OVERRIDE = previousOverride;
    await app.close();
  });

  it('lets a link session work while the rule is off', async () => {
    required = false;
    await request(app.getHttpServer()).get('/settings/operating').expect(200);
  });

  it('limits a staff member with no passkey to setting one up', async () => {
    const refused = await request(app.getHttpServer())
      .get('/settings/operating')
      .expect(403);
    expect(refused.body.code).toBe('PASSKEY_SETUP_REQUIRED');

    const status = await request(app.getHttpServer()).get('/me/passkeys').expect(200);
    expect(status.body).toEqual({
      required: true,
      passkeySession: false,
      recoverySession: false,
      state: 'enroll',
      passkeys: [],
    });
  });

  it('sends an enrolled staff member who used a link back to their passkey', async () => {
    passkeys = [{ id: 'pk-1', name: 'Office laptop' }];
    const refused = await request(app.getHttpServer())
      .get('/settings/operating')
      .expect(401);
    expect(refused.body.code).toBe('PASSKEY_SIGN_IN_REQUIRED');

    const status = await request(app.getHttpServer()).get('/me/passkeys').expect(200);
    expect(status.body.state).toBe('use_passkey');
    expect(status.body.passkeys).toEqual([
      {
        id: 'pk-1',
        name: 'Office laptop',
        createdAt: '2026-10-26T09:00:00.000Z',
        deviceType: 'multiDevice',
        backedUp: true,
      },
    ]);
  });

  it('accepts a passkey session', async () => {
    passkeys = [{ id: 'pk-1', name: null }];
    signInMethod = 'passkey';
    await request(app.getHttpServer()).get('/settings/operating').expect(200);
    const status = await request(app.getHttpServer()).get('/me/passkeys').expect(200);
    expect(status.body).toMatchObject({ state: 'ok', passkeySession: true });
  });

  it('treats a session from before the method was recorded as a link session', async () => {
    signInMethod = null;
    await request(app.getHttpServer()).get('/settings/operating').expect(403);
  });

  it('never holds back a traveler', async () => {
    role = 'TRAVELER';
    await request(app.getHttpServer()).get('/me/passkeys').expect(200);
  });

  it('is suspended by the break-glass', async () => {
    process.env.STAFF_PASSKEYS_OVERRIDE = 'off';
    await request(app.getHttpServer()).get('/settings/operating').expect(200);
  });
});

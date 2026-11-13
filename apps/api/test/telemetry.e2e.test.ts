import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  MockTelemetrySink,
  type SinkEvent,
  type TelemetryRecordOptions,
} from '../src/telemetry/telemetry-sink';
import { hashUserId } from '../src/telemetry/telemetry.service';
import { TELEMETRY_SINK } from '../src/telemetry/telemetry.tokens';
import { withNoSettingsVersion } from './fixtures/operating-settings';
import { isIP } from 'node:net';

const SECRET = 'test-secret-for-telemetry';

class CapturingSink extends MockTelemetrySink {
  lastOptions: TelemetryRecordOptions | undefined;

  override async record(
    events: readonly SinkEvent[],
    options?: TelemetryRecordOptions,
  ): Promise<void> {
    this.lastOptions = options;
    return super.record(events, options);
  }
}

const context = (consent: string, extra: Record<string, string> = {}) => ({
  app: 'web',
  screen: 'Package',
  locale: 'en',
  currency: 'EUR',
  device_type: 'phone',
  viewport: 'xs',
  network: '4g',
  consent,
  ...extra,
});

const packageViewed = (consent = 'analytics') => ({
  event: 'package_viewed',
  ts: new Date().toISOString(),
  context: context(
    consent,
    consent === 'essential' ? {} : { session_id: 's_0123456789abcdef' },
  ),
  params: { package_id: 'trinidad-heritage-trail', price_from: 1290 },
});

describe('T-Events intake (POST /telemetry/events)', () => {
  let app: INestApplication;
  let sink: CapturingSink;
  let sessionUser: string | null;
  let sessionRole: string;
  let sessionExtra: { deactivatedAt?: Date; signedInAt?: Date };
  let sessionReads: number;
  const previousSecret = process.env.AUTH_SECRET;

  beforeAll(async () => {
    process.env.AUTH_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(withNoSettingsVersion({}))
      .overrideProvider(AuthService)
      .useValue({
        getSession: async () => {
          sessionReads += 1;
          return sessionUser
            ? {
                user: {
                  id: sessionUser,
                  email: 't@example.test',
                  role: sessionRole,
                  deactivatedAt: sessionExtra.deactivatedAt ?? null,
                },
                session: { createdAt: sessionExtra.signedInAt ?? new Date() },
              }
            : null;
        },
      })
      .overrideProvider(TELEMETRY_SINK)
      .useFactory({ factory: () => new CapturingSink() })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    sink = app.get(TELEMETRY_SINK);
  });

  beforeEach(() => {
    sessionUser = null;
    sessionRole = 'TRAVELER';
    sessionExtra = {};
    sessionReads = 0;
  });

  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = previousSecret;
    }
  });

  const post = (events: unknown[]) =>
    request(app.getHttpServer()).post('/telemetry/events').send({ events });
  const last = (count: number): SinkEvent[] => sink.recent().slice(-count);

  it('takes a signed-out visitor’s analytics event without a session, with its funnel stage', async () => {
    const response = await post([packageViewed()]);

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: 1, rejected: 0 });
    const [stored] = last(1);
    expect(stored).toMatchObject({
      event: 'package_viewed',
      userId: null,
      context: { screen: 'Package', funnel_stage: 3, session_id: 's_0123456789abcdef' },
    });
  });

  it('forwards the request IP and User-Agent to the sink for visitor counting', async () => {
    await request(app.getHttpServer())
      .post('/telemetry/events')
      .set('User-Agent', 'Mozilla/5.0 (Test)')
      .send({ events: [packageViewed()] });

    expect(sink.lastOptions?.clientIp).toBeTypeOf('string');
    expect(isIP(sink.lastOptions?.clientIp ?? '')).toBeGreaterThan(0);
    expect(sink.lastOptions?.userAgent).toBe('Mozilla/5.0 (Test)');
  });

  it('hashes a signed-in traveler’s id onto analytics events, never the raw id', async () => {
    sessionUser = 'user-123';

    await post([packageViewed()]);

    const [stored] = last(1);
    expect(stored!.userId).toBe(hashUserId('user-123', SECRET));
    expect(stored!.userId).toMatch(/^h_[0-9a-f]{32}$/);
    expect(JSON.stringify(stored)).not.toContain('user-123');
  });

  it('without analytics consent keeps only essential events, with no session or user id', async () => {
    sessionUser = 'user-123';
    const before = sink.recent().length;

    const response = await post([
      packageViewed('essential'),
      {
        event: 'booking_submitted',
        ts: new Date().toISOString(),
        context: context('essential', { screen: 'Booking' }),
        params: { booking_code: 'VX7K2M9Q', total: 2580, currency: 'EUR', travelers: 2 },
      },
    ]);

    expect(response.body).toEqual({ accepted: 1, rejected: 1 });
    expect(sink.recent().length).toBe(before + 1);
    const [stored] = last(1);
    expect(stored).toMatchObject({
      event: 'booking_submitted',
      essential: true,
      userId: null,
    });
    expect(stored!.context).not.toHaveProperty('session_id');
    // No identity is wanted, so the session is never read.
    expect(sessionReads).toBe(0);
  });

  it('refuses events and parameters outside the taxonomy, counting them', async () => {
    const before = sink.recent().length;

    const response = await post([
      { ...packageViewed(), event: 'mouse_hovered' },
      { ...packageViewed(), params: { package_id: 'jane@example.test' } },
      { ...packageViewed(), params: { email: 'x' } },
    ]);

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: 0, rejected: 3 });
    expect(sink.recent().length).toBe(before);
  });

  it('refuses a malformed or oversized batch outright', async () => {
    expect((await post([])).status).toBe(400);
    expect((await post(Array.from({ length: 21 }, () => packageViewed()))).status).toBe(
      400,
    );
    expect(
      (
        await request(app.getHttpServer())
          .post('/telemetry/events')
          .send({ events: [packageViewed()], userId: 'u1' })
      ).status,
    ).toBe(400);
  });

  describe('desk events', () => {
    const transition = () => ({
      event: 'document_generated',
      ts: new Date().toISOString(),
      context: context('essential', { app: 'admin', screen: 'A-Booking' }),
      params: { booking_code: 'DEMO0001', trigger: 'manual' },
    });

    it("stamps the operator's role from the session, with no user or session id", async () => {
      sessionUser = 'ops-1';
      sessionRole = 'OPERATIONS_ADMIN';

      const response = await post([transition()]);

      expect(response.body).toEqual({ accepted: 1, rejected: 0 });
      const [stored] = last(1);
      expect(stored).toMatchObject({
        event: 'document_generated',
        essential: true,
        userId: null,
        context: {
          app: 'admin',
          screen: 'A-Booking',
          role: 'ops_admin',
          funnel_stage: null,
        },
      });
      expect(stored!.context).not.toHaveProperty('session_id');
      expect(JSON.stringify(stored)).not.toContain('ops-1');
      expect(sessionReads).toBe(1);
    });

    it('refuses desk events without a live staff session', async () => {
      const before = sink.recent().length;

      expect((await post([transition()])).body).toEqual({ accepted: 0, rejected: 1 });
      sessionUser = 'traveler-1';
      expect((await post([transition()])).body).toEqual({ accepted: 0, rejected: 1 });
      sessionRole = 'SUPER_ADMIN';
      sessionExtra = { deactivatedAt: new Date() };
      expect((await post([transition()])).body).toEqual({ accepted: 0, rejected: 1 });
      // M9 D9: a desk session ends 12 hours after sign-in.
      sessionExtra = { signedInAt: new Date(Date.now() - 13 * 60 * 60 * 1000) };
      expect((await post([transition()])).body).toEqual({ accepted: 0, rejected: 1 });
      expect(sink.recent().length).toBe(before);
    });

    it('never takes the role from the client', async () => {
      sessionUser = 'support-1';
      sessionRole = 'ADMINISTRATIVE_SUPPORT';
      const forged = transition();
      forged.context = { ...forged.context, role: 'super_admin' };

      expect((await post([forged])).body).toEqual({ accepted: 0, rejected: 1 });
    });

    it('refuses the events only the API records, whoever sends them', async () => {
      sessionUser = 'admin-1';
      sessionRole = 'SUPER_ADMIN';
      const before = sink.recent().length;
      const forged = {
        ...transition(),
        event: 'booking_state_changed',
        params: {
          booking_code: 'DEMO0001',
          from: 'DRAFT',
          to: 'CONFIRMED',
          actor: 'system',
          reason: 'payment_confirmed',
        },
      };

      expect((await post([forged])).body).toEqual({ accepted: 0, rejected: 1 });
      expect(
        (await post([{ ...forged, context: context('essential', { app: 'server' }) }]))
          .body,
      ).toEqual({ accepted: 0, rejected: 1 });
      expect(sink.recent().length).toBe(before);
    });
  });
});

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { MockTelemetrySink, type SinkEvent } from '../src/telemetry/telemetry-sink';
import { hashUserId } from '../src/telemetry/telemetry.service';
import { TELEMETRY_SINK } from '../src/telemetry/telemetry.tokens';

const SECRET = 'test-secret-for-telemetry';

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
  let sink: MockTelemetrySink;
  let sessionUser: string | null;
  let sessionReads: number;
  const previousSecret = process.env.AUTH_SECRET;

  beforeAll(async () => {
    process.env.AUTH_SECRET = SECRET;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue({
        getSession: async () => {
          sessionReads += 1;
          return sessionUser
            ? { user: { id: sessionUser, email: 't@example.test', role: 'TRAVELER' } }
            : null;
        },
      })
      .overrideProvider(TELEMETRY_SINK)
      .useFactory({ factory: () => new MockTelemetrySink() })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    sink = app.get(TELEMETRY_SINK);
  });

  beforeEach(() => {
    sessionUser = null;
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
});

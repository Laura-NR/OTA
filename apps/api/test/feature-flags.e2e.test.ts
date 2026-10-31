import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  DEFAULT_OPERATING_THRESHOLDS,
  featureFlagsOf,
  type FeatureFlag,
  type FeatureFlagValues,
} from '@ota/domain';
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

const RESERVATION_ID = '33333333-3333-4333-8333-333333333333';
const ITEM_ID = '44444444-4444-4444-8444-444444444444';

const OFF = (flag: FeatureFlag) => ({ code: 'FEATURE_OFF', feature: flag });

/**
 * Runtime feature flags at the API (M9 D8b): `GET /tenant/config` serves the
 * flags in force, and a switched-off flag refuses what it covers with 409
 * `FEATURE_OFF` before any work is done. The Prisma fake holds only the
 * traveler's ownership check, so a request that got past the gate would fail
 * with 500 instead. The routes' own tests run with every flag on.
 */
describe('runtime feature flags (GET /tenant/config and the gated routes)', () => {
  let app: INestApplication;
  let flags: FeatureFlagValues;
  let role: string | null;

  beforeAll(async () => {
    const values = () => ({ ...DEFAULT_OPERATING_THRESHOLDS, ...flags });
    const settings = Object.assign(fakeOperatingSettings(), {
      thresholds: async () => values(),
      features: async () => featureFlagsOf(values()),
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(
        withNoSettingsVersion({
          // The traveler's own booking, checked before the payment gate.
          reservation: { findFirst: async () => ({ id: RESERVATION_ID }) },
        }),
      )
      .overrideProvider(OperatingSettingsService)
      .useValue(settings)
      .overrideProvider(AuthService)
      .useValue({
        getSession: async () =>
          role
            ? {
                user: { id: 'u-1', email: 'u@example.test', role, deactivatedAt: null },
                session: {
                  id: 's-1',
                  userId: 'u-1',
                  createdAt: new Date(),
                  signInMethod: 'passkey',
                  lastActiveAt: new Date(),
                  ownDevice: true,
                },
              }
            : null,
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    flags = featureFlagsOf(DEFAULT_OPERATING_THRESHOLDS);
    role = null;
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the flags in force to the public, not the manifest file', async () => {
    flags = { ...flags, recruitmentPortal: false, instantBooking: true };
    const response = await request(app.getHttpServer()).get('/tenant/config');
    expect(response.status).toBe(200);
    expect(response.body.features).toEqual(flags);
  });

  it('refuses a public application while the recruitment portal is off', async () => {
    flags = { ...flags, recruitmentPortal: false };
    const response = await request(app.getHttpServer())
      .post('/supplier-applications')
      .send({
        fullName: 'Ana Guide',
        email: 'ana.guide@example.test',
        phone: '+53 5555 1234',
        category: 'TOUR_GUIDE',
        provincesActive: ['La Habana'],
        rtnLicenseNumber: 'RTN-ANA-001',
      });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject(OFF('recruitmentPortal'));
  });

  it('refuses a custom request and a custom itinerary while the builder is off', async () => {
    flags = { ...flags, customItineraryBuilder: false };
    role = 'TRAVELER';
    const trip = { startDate: '2027-03-01', endDate: '2027-03-05' };

    const requested = await request(app.getHttpServer())
      .post('/me/custom-requests')
      .send({ ...trip, adults: 2 });
    expect(requested.status).toBe(409);
    expect(requested.body).toMatchObject(OFF('customItineraryBuilder'));

    const built = await request(app.getHttpServer())
      .post('/me/reservations')
      .send({ ...trip, serviceItems: [{ inventoryItemId: ITEM_ID }] });
    expect(built.status).toBe(409);
    expect(built.body).toMatchObject(OFF('customItineraryBuilder'));
  });

  it('still validates the body first, so a bad request is not reported as switched off', async () => {
    flags = { ...flags, customItineraryBuilder: false };
    role = 'TRAVELER';
    const response = await request(app.getHttpServer())
      .post('/me/custom-requests')
      .send({ startDate: 'not a date' });
    expect(response.status).toBe(400);
  });

  it("refuses a traveler's transfer link while the wire rail is off", async () => {
    flags = { ...flags, directBankTransferRail: false };
    role = 'TRAVELER';
    const response = await request(app.getHttpServer())
      .post(`/me/reservations/${RESERVATION_ID}/payments`)
      .send({ rail: 'OPEN_BANKING_SEPA' });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject(OFF('directBankTransferRail'));
  });

  it("refuses the desk's card link while the card rail is off, and only that rail", async () => {
    flags = { ...flags, creditCardGatewayRail: false };
    role = 'OPERATIONS_ADMIN';
    const card = await request(app.getHttpServer())
      .post(`/reservations/${RESERVATION_ID}/payments`)
      .send({ rail: 'CARD' });
    expect(card.status).toBe(409);
    expect(card.body).toMatchObject(OFF('creditCardGatewayRail'));

    flags = { ...flags, creditCardGatewayRail: true, directBankTransferRail: false };
    const other = await request(app.getHttpServer())
      .post(`/reservations/${RESERVATION_ID}/payments`)
      .send({ rail: 'OTHER' });
    expect(other.status).toBe(409);
    expect(other.body).toMatchObject(OFF('directBankTransferRail'));
  });
});

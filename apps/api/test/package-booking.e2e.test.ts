import { randomBytes, randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseTenantConfig } from '@ota/config';
import { Prisma } from '@ota/db';
import type { LegalContent } from '@ota/schemas';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { LEGAL_CONTENT } from '../src/compliance/compliance.tokens';
import { PrismaService } from '../src/prisma/prisma.service';
import { TENANT_CONFIG } from '../src/tenant/tenant.tokens';
import { PASSPORT_KEY } from '../src/travelers/travelers.tokens';

const TRAVELER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'margaret@example.test',
  role: 'TRAVELER',
};
const PACKAGE_ID = '22222222-2222-4222-8222-222222222222';
const TIER_STANDARD = '33333333-3333-4333-8333-333333333333';
const TIER_COMFORT = '44444444-4444-4444-8444-444444444444';
const DEPARTURE = '55555555-5555-4555-8555-555555555555';
const CLOSED_DEPARTURE = '56565656-5656-4656-8656-565656565656';
const EXTRA = '66666666-6666-4666-8666-666666666666';
const RETIRED_EXTRA = '67676767-6767-4767-8767-676767676767';
const ITEM = '77777777-7777-4777-8777-777777777777';

const tenant = parseTenantConfig({
  tenantId: 'test-agency',
  branding: { agencyName: 'Test Agency', licenseNumber: 'MINTUR-TEST-1234' },
  pricing: {
    childBands: [
      { maxAge: 1, rate: 0 },
      { maxAge: 12, rate: 0.6 },
    ],
    fees: [
      { label: 'Cuban tourist card', unit: 'PER_PERSON', amount: 25 },
      { label: 'Service fee', unit: 'PER_BOOKING', amount: 100 },
    ],
  },
});

const legal: Record<string, LegalContent> = {
  en: {
    status: 'placeholder',
    ofacStatement: { version: 'ofac@1', text: 'I certify my travel category.' },
    consents: {
      TERMS: { version: 'terms@1', text: 'Terms, cancellation and privacy.' },
      PRIVACY_NOTICE: { version: 'terms@1', text: 'Terms, cancellation and privacy.' },
      CANCELLATION_POLICY: {
        version: 'terms@1',
        text: 'Terms, cancellation and privacy.',
      },
      INSURANCE_ACKNOWLEDGEMENT: {
        version: 'insurance@1',
        text: 'Insurance is required.',
      },
      TRIP_MESSAGES: { version: 'trip@1', text: 'Briefing and check-ins.' },
    },
  },
};

const CONSENTS = [
  { purpose: 'TERMS', textVersion: 'terms@1' },
  { purpose: 'PRIVACY_NOTICE', textVersion: 'terms@1' },
  { purpose: 'CANCELLATION_POLICY', textVersion: 'terms@1' },
  { purpose: 'INSURANCE_ACKNOWLEDGEMENT', textVersion: 'insurance@1' },
];

type Row = Record<string, unknown> & { id: string };

interface State {
  reservations: Row[];
  serviceItems: Row[];
  rooms: Row[];
  travelers: Row[];
  extras: Row[];
  lines: Row[];
  affidavits: Row[];
  consents: Row[];
  audits: Row[];
  users: Row[];
  /** Places already held on the departure by other bookings. */
  booked: number;
}

const decimal = (value: number | string) => new Prisma.Decimal(value);

const pkg = {
  id: PACKAGE_ID,
  name: 'Vinales Eco Trail',
  slug: 'vinales-eco-trail',
  status: 'PUBLISHED',
  durationDays: 8,
  currency: 'EUR',
  basePrice: decimal('1000.00'),
  tourismCategory: 'ECOTOURISM',
  services: [
    {
      id: randomUUID(),
      packageId: PACKAGE_ID,
      inventoryItemId: ITEM,
      dayOffset: 1,
      position: 0,
      inventoryItem: { id: ITEM, type: 'ACCOMMODATION', province: 'Pinar del Río' },
    },
  ],
  tiers: [
    {
      id: TIER_STANDARD,
      name: 'Standard',
      priceDelta: decimal(0),
      singleSupplement: decimal(300),
      isDefault: true,
    },
    {
      id: TIER_COMFORT,
      name: 'Comfort',
      priceDelta: decimal(120),
      singleSupplement: decimal(380),
      isDefault: false,
    },
  ],
  departures: [
    {
      id: DEPARTURE,
      startDate: new Date('2027-02-13T00:00:00Z'),
      capacity: 8,
      price: null,
      status: 'OPEN',
    },
    {
      id: CLOSED_DEPARTURE,
      startDate: new Date('2027-03-06T00:00:00Z'),
      capacity: 8,
      price: null,
      status: 'CLOSED',
    },
  ],
  extras: [
    {
      id: EXTRA,
      name: 'Horseback ride',
      price: decimal(35),
      priceUnit: 'PER_PERSON',
      active: true,
    },
    {
      id: RETIRED_EXTRA,
      name: 'Retired ride',
      price: decimal(10),
      priceUnit: 'PER_BOOKING',
      active: false,
    },
  ],
};

function seed(): State {
  return {
    reservations: [],
    serviceItems: [],
    rooms: [],
    travelers: [],
    extras: [],
    lines: [],
    affidavits: [],
    consents: [],
    audits: [],
    users: [{ id: TRAVELER.id, phone: null, nationality: null }],
    booked: 0,
  };
}

function createFakePrisma(state: State) {
  const withId = (data: Record<string, unknown>): Row => ({
    id: (data.id as string | undefined) ?? randomUUID(),
    ...data,
  });
  const fake = {
    package: {
      findUnique: async (args: { where: { id: string } }) =>
        args.where.id === PACKAGE_ID ? pkg : null,
    },
    reservation: {
      aggregate: async () => ({ _sum: { partySize: state.booked } }),
      findUnique: async (args: { where: { bookingCode?: string } }) =>
        state.reservations.find((row) => row.bookingCode === args.where.bookingCode) ??
        null,
      create: async (args: {
        data: Record<string, unknown> & {
          serviceItems: { create: Record<string, unknown>[] };
        };
      }) => {
        const { serviceItems, ...data } = args.data;
        const row = withId({
          ...data,
          totalAmount: decimal(data.totalAmount as number),
          createdAt: new Date(),
        });
        state.reservations.push(row);
        for (const item of serviceItems.create) {
          state.serviceItems.push(withId({ ...item, reservationId: row.id }));
        }
        return row;
      },
      findFirst: async (args: { where: { id: string; userId: string } }) => {
        const row = state.reservations.find(
          (candidate) =>
            candidate.id === args.where.id && candidate.userId === args.where.userId,
        );
        if (!row) return null;
        const items = state.serviceItems
          .filter((item) => item.reservationId === row.id)
          .map((item) => ({ ...item, supplierId: null, dispatchOffers: [] }));
        return {
          ...row,
          serviceItems: items,
          documents: [],
          reviews: [],
          package: null,
          tier: null,
          travelers: state.travelers.filter(
            (traveler) => traveler.reservationId === row.id,
          ),
          _count: { serviceItems: items.length, documents: 0 },
        };
      },
    },
    user: {
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const user = state.users.find((row) => row.id === args.where.id)!;
        Object.assign(user, args.data);
        return user;
      },
    },
    reservationRoom: {
      createMany: async (args: { data: Record<string, unknown>[] }) => {
        state.rooms.push(...args.data.map(withId));
        return { count: args.data.length };
      },
    },
    reservationTraveler: {
      createMany: async (args: { data: Record<string, unknown>[] }) => {
        state.travelers.push(...args.data.map(withId));
        return { count: args.data.length };
      },
    },
    reservationExtra: {
      createMany: async (args: { data: Record<string, unknown>[] }) => {
        state.extras.push(...args.data.map(withId));
        return { count: args.data.length };
      },
    },
    reservationPriceLine: {
      createMany: async (args: { data: Record<string, unknown>[] }) => {
        state.lines.push(...args.data.map(withId));
        return { count: args.data.length };
      },
    },
    travelerAffidavit: {
      create: async (args: { data: Record<string, unknown> }) => {
        const row = withId({ ...args.data, createdAt: new Date() });
        state.affidavits.push(row);
        return row;
      },
    },
    consentRecord: {
      createMany: async (args: { data: Record<string, unknown>[] }) => {
        state.consents.push(...args.data.map(withId));
        return { count: args.data.length };
      },
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        const row = withId(args.data);
        state.audits.push(row);
        return row;
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(fake),
  };
  return fake;
}

const fakeAuthService = {
  getSession: async (headers: Record<string, string | string[] | undefined>) =>
    headers['x-test-user'] === TRAVELER.email
      ? {
          user: { id: TRAVELER.id, email: TRAVELER.email, role: TRAVELER.role },
          session: { id: 'session-1', userId: TRAVELER.id, expiresAt: new Date() },
        }
      : null,
};

async function buildApp(state: State, key: Buffer | null): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(createFakePrisma(state))
    .overrideProvider(AuthService)
    .useValue(fakeAuthService)
    .overrideProvider(TENANT_CONFIG)
    .useValue(tenant)
    .overrideProvider(LEGAL_CONTENT)
    .useValue(legal)
    .overrideProvider(PASSPORT_KEY)
    .useValue(key)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

const family = {
  packageId: PACKAGE_ID,
  departureId: DEPARTURE,
  tierId: TIER_COMFORT,
  rooming: 'SHARE',
  travelers: [
    {
      fullName: 'Margaret Anne Chen',
      dateOfBirth: '1980-04-02',
      nationality: 'US',
      passportNumber: 'AB 123 4567',
    },
    { fullName: 'David Chen', dateOfBirth: '1979-11-20', nationality: 'CA' },
    { fullName: 'Emma Chen', dateOfBirth: '2018-06-01', nationality: 'CA' },
  ],
  phone: '+1 416 555 0134',
  emergencyContactName: 'Laura Chen',
  emergencyContactPhone: '+1 604 555 0199',
  extras: [{ packageExtraId: EXTRA }],
  notes: 'Emma is vegetarian.',
  affidavits: [
    {
      traveler: 0,
      category: 'SUPPORT_FOR_THE_CUBAN_PEOPLE',
      signature: 'margaret anne chen',
    },
  ],
  statementVersion: 'ofac@1',
  consents: [...CONSENTS, { purpose: 'TRIP_MESSAGES', textVersion: 'trip@1' }],
  locale: 'en',
};

describe('Booking form API (POST /me/reservations/package-booking)', () => {
  let app: INestApplication;
  let state: State;

  beforeEach(async () => {
    state = seed();
    app = await buildApp(state, randomBytes(32));
  });

  afterEach(async () => {
    await app.close();
  });

  const book = (body: unknown) =>
    request(app.getHttpServer())
      .post('/me/reservations/package-booking')
      .set('x-test-user', TRAVELER.email)
      .set('user-agent', 'BookingTest/1.0')
      .send(body);

  it('books the party on the departure and freezes the server price', async () => {
    const response = await book(family);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: 'ITINERARY_SUBMITTED',
      startDate: '2027-02-13T00:00:00.000Z',
      endDate: '2027-02-20T00:00:00.000Z',
      totalCurrency: 'EUR',
      // 2 × 1000 base + 2 × 120 tier + child 60 % of 1120 + 3 × 35 horseback
      // + 3 × 25 tourist card + 100 service fee.
      totalAmount: '3192',
      serviceItemCount: 1,
    });
    expect(state.reservations[0]).toMatchObject({
      partySize: 3,
      tierId: TIER_COMFORT,
      departureId: DEPARTURE,
      tourismCategory: 'ECOTOURISM',
      packageId: PACKAGE_ID,
    });
    expect(state.reservations[0]!.customItineraryPayload).toMatchObject({
      rooming: 'SHARE',
      notes: 'Emma is vegetarian.',
    });

    const lines = state.lines.map((line) => [line.kind, line.quantity, line.amount]);
    expect(lines).toEqual([
      ['BASE', 2, 2000],
      ['TIER', 2, 240],
      ['CHILD', 1, 672],
      ['EXTRA', 3, 105],
      ['FEE', 3, 75],
      ['FEE', 1, 100],
    ]);
    const child = state.travelers.find((traveler) => traveler.fullName === 'Emma Chen')!;
    expect(state.lines[2]!.travelerId).toBe(child.id);
    expect(state.extras).toEqual([
      expect.objectContaining({ packageExtraId: EXTRA, quantity: 1, amount: 105 }),
    ]);
  });

  it('reads each kind from the date of birth and shares one room for three', async () => {
    await book(family);

    expect(state.travelers.map((traveler) => [traveler.kind, traveler.isLead])).toEqual([
      ['ADULT', true],
      ['ADULT', false],
      ['CHILD', false],
    ]);
    expect(state.rooms).toEqual([expect.objectContaining({ capacity: 3 })]);
    expect(new Set(state.travelers.map((traveler) => traveler.roomId))).toEqual(
      new Set([state.rooms[0]!.id]),
    );
    expect(state.travelers[0]).toMatchObject({
      emergencyContactName: 'Laura Chen',
      emergencyContactPhone: '+1 604 555 0199',
    });
    expect(state.users[0]).toMatchObject({ phone: '+1 416 555 0134', nationality: 'US' });
  });

  it('stores the passport only as ciphertext and never returns or audits it', async () => {
    const response = await book(family);

    const stored = state.travelers[0]!.passportNumberEnc as string;
    expect(stored.startsWith('v1.')).toBe(true);
    expect(stored).not.toContain('AB1234567');
    expect(state.travelers[1]!.passportNumberEnc).toBeNull();
    expect(JSON.stringify(response.body)).not.toContain('AB1234567');
    expect(JSON.stringify(state.audits)).not.toMatch(/AB1234567|Chen/);
  });

  it('keeps the US certification and the consents with the booking', async () => {
    const response = await book(family);

    expect(state.affidavits).toEqual([
      expect.objectContaining({
        reservationId: response.body.id,
        travelerId: state.travelers[0]!.id,
        category: 'SUPPORT_FOR_THE_CUBAN_PEOPLE',
        signerName: 'Margaret Anne Chen',
        source: 'ONLINE',
        statementVersion: 'ofac@1',
        userAgent: 'BookingTest/1.0',
      }),
    ]);
    expect(state.affidavits[0]!.ipAddress).toEqual(expect.any(String));
    expect(
      state.consents.map((consent) => [consent.purpose, consent.textVersion]),
    ).toEqual([
      ['TERMS', 'terms@1'],
      ['PRIVACY_NOTICE', 'terms@1'],
      ['CANCELLATION_POLICY', 'terms@1'],
      ['INSURANCE_ACKNOWLEDGEMENT', 'insurance@1'],
      ['TRIP_MESSAGES', 'trip@1'],
    ]);
    expect(state.consents[0]).toMatchObject({
      userId: TRAVELER.id,
      reservationId: response.body.id,
      granted: true,
      source: 'BOOKING',
    });
    expect(state.audits.map((audit) => audit.action)).toEqual([
      'affidavit.signed',
      'reservation.submitted',
    ]);
  });

  it('charges the single supplement for each traveler in a private room', async () => {
    const response = await book({
      ...family,
      rooming: 'PRIVATE',
      travelers: family.travelers.slice(0, 2),
      extras: [],
    });

    expect(response.status).toBe(201);
    // 2 × 1000 + 2 × 120 + 2 × 380 supplement + 2 × 25 + 100.
    expect(response.body.totalAmount).toBe('3150');
    expect(state.rooms.map((room) => room.capacity)).toEqual([1, 1]);
  });

  it('takes the default tier when none is chosen', async () => {
    const response = await book({ ...family, tierId: null, affidavits: [] });

    expect(response.status).toBe(201);
    expect(state.reservations[0]!.tierId).toBe(TIER_STANDARD);
  });

  it('refuses a price that moved since it was shown, and accepts the same one', async () => {
    const moved = await book({ ...family, expectedTotal: 3000 });
    expect(moved.status).toBe(409);
    expect(moved.body).toMatchObject({ error: 'PriceChanged', total: '3192.00' });
    expect(state.reservations).toHaveLength(0);

    const same = await book({ ...family, expectedTotal: 3192 });
    expect(same.status).toBe(201);
  });

  it('refuses stale legal words and writes nothing', async () => {
    const consents = await book({
      ...family,
      consents: [{ purpose: 'TERMS', textVersion: 'terms@0' }, ...CONSENTS.slice(1)],
    });
    expect(consents.status).toBe(409);

    const statement = await book({ ...family, statementVersion: 'ofac@0' });
    expect(statement.status).toBe(409);
    expect(state.reservations).toHaveLength(0);
    expect(state.consents).toHaveLength(0);
  });

  it('refuses a signature that is not the name, or a certification nobody needs', async () => {
    const signature = await book({
      ...family,
      affidavits: [{ ...family.affidavits[0], signature: 'M. Chen' }],
    });
    expect(signature.status).toBe(400);

    const notUs = await book({
      ...family,
      affidavits: [{ ...family.affidavits[0], traveler: 1, signature: 'David Chen' }],
    });
    expect(notUs.status).toBe(400);
    expect(state.reservations).toHaveLength(0);
  });

  it('refuses a departure that is closed or without enough places', async () => {
    const closed = await book({ ...family, departureId: CLOSED_DEPARTURE });
    expect(closed.status).toBe(409);

    state.booked = 6;
    const full = await book(family);
    expect(full.status).toBe(409);
    expect(full.body.message).toContain('places');
  });

  it('refuses a lead under 18 and an extra the package does not offer', async () => {
    const minor = await book({
      ...family,
      travelers: [family.travelers[2], family.travelers[1]],
      affidavits: [],
    });
    expect(minor.status).toBe(400);

    const retired = await book({
      ...family,
      extras: [{ packageExtraId: RETIRED_EXTRA }],
    });
    expect(retired.status).toBe(400);
    expect(state.reservations).toHaveLength(0);
  });

  it('returns 401 without a session', async () => {
    const response = await request(app.getHttpServer())
      .post('/me/reservations/package-booking')
      .send(family);

    expect(response.status).toBe(401);
  });
});

describe('Booking form API without a passport key', () => {
  it('books without passport numbers but refuses one with 503', async () => {
    const state = seed();
    const app = await buildApp(state, null);
    const book = (body: unknown) =>
      request(app.getHttpServer())
        .post('/me/reservations/package-booking')
        .set('x-test-user', TRAVELER.email)
        .send(body);

    const refused = await book(family);
    expect(refused.status).toBe(503);
    expect(state.reservations).toHaveLength(0);

    const travelers = family.travelers.map(({ passportNumber: _omit, ...rest }) => rest);
    const booked = await book({ ...family, travelers });
    expect(booked.status).toBe(201);

    await app.close();
  });
});

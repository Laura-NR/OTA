import { randomBytes, randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseTenantConfig } from '@ota/config';
import { Prisma } from '@ota/db';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TENANT_CONFIG } from '../src/tenant/tenant.tokens';
import { PASSPORT_KEY } from '../src/travelers/travelers.tokens';

const OPS = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ops@example.test',
  role: 'OPERATIONS_ADMIN',
};
const PACKAGE_BOOKING = '33333333-3333-4333-8333-333333333333';
const CUSTOM_BOOKING = '44444444-4444-4444-8444-444444444444';
const OTHER_BOOKING = '45454545-4545-4545-8545-454545454545';
const PACKAGE_ID = '55555555-5555-4555-8555-555555555555';
const TIER_COMFORT = '66666666-6666-4666-8666-666666666666';
const DEPARTURE = '77777777-7777-4777-8777-777777777777';
const SMALL_DEPARTURE = '78787878-7878-4878-8878-787878787878';
const PACKAGE_EXTRA = '88888888-8888-4888-8888-888888888888';

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

type Row = Record<string, unknown> & { id: string };

interface State {
  reservations: Row[];
  travelers: Row[];
  rooms: Row[];
  extras: Row[];
  lines: Row[];
  audits: Row[];
  packages: Row[];
}

const decimal = (value: unknown) =>
  value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value as number);
const byPosition = (a: Row, b: Row) => (a.position as number) - (b.position as number);

function seed(): State {
  const reservation = (id: string, overrides: Partial<Row> = {}): Row => ({
    id,
    userId: OPS.id,
    packageId: PACKAGE_ID,
    bookingCode: id.slice(0, 8).toUpperCase(),
    startDate: new Date('2027-02-13T00:00:00Z'),
    endDate: new Date('2027-02-20T00:00:00Z'),
    status: 'ITINERARY_SUBMITTED',
    totalCurrency: 'EUR',
    totalAmount: decimal(1000),
    partySize: 1,
    tierId: null,
    departureId: null,
    ...overrides,
  });
  return {
    reservations: [
      reservation(PACKAGE_BOOKING),
      reservation(CUSTOM_BOOKING, { packageId: null, totalAmount: decimal(640) }),
      reservation(OTHER_BOOKING, { departureId: SMALL_DEPARTURE, partySize: 3 }),
    ],
    travelers: [],
    rooms: [],
    extras: [],
    lines: [],
    audits: [],
    packages: [
      {
        id: PACKAGE_ID,
        name: 'Trinidad Heritage Trail',
        basePrice: decimal(1000),
        tiers: [
          {
            id: TIER_COMFORT,
            name: 'Comfort',
            priceDelta: decimal(120),
            singleSupplement: decimal(380),
          },
        ],
        departures: [
          {
            id: DEPARTURE,
            startDate: new Date('2027-02-13T00:00:00Z'),
            capacity: 12,
            price: decimal(1275),
            status: 'OPEN',
          },
          {
            id: SMALL_DEPARTURE,
            startDate: new Date('2027-03-06T00:00:00Z'),
            capacity: 4,
            price: null,
            status: 'OPEN',
          },
        ],
        extras: [
          {
            id: PACKAGE_EXTRA,
            name: 'Horseback half day',
            price: decimal(60),
            priceUnit: 'PER_PERSON',
            active: true,
          },
        ],
      },
    ],
  };
}

function createFakePrisma(state: State) {
  const withParty = (reservation: Row) => ({
    ...reservation,
    rooms: state.rooms
      .filter((room) => room.reservationId === reservation.id)
      .sort(byPosition),
    travelers: state.travelers
      .filter((traveler) => traveler.reservationId === reservation.id)
      .sort(byPosition),
    extras: state.extras
      .filter((extra) => extra.reservationId === reservation.id)
      .sort(byPosition),
    priceLines: state.lines
      .filter((line) => line.reservationId === reservation.id)
      .sort(byPosition),
    package: state.packages.find((pkg) => pkg.id === reservation.packageId) ?? null,
  });
  const decimals = (data: Row, keys: string[]) => {
    for (const key of keys) {
      if (data[key] !== undefined) data[key] = decimal(data[key]);
    }
    return data;
  };

  const fake = {
    reservation: {
      findUnique: async (args: { where: { id: string }; include?: unknown }) => {
        const row = state.reservations.find(
          (reservation) => reservation.id === args.where.id,
        );
        return row ? withParty(row) : null;
      },
      update: async (args: { where: { id: string }; data: Row }) => {
        const row = state.reservations.find(
          (reservation) => reservation.id === args.where.id,
        )!;
        Object.assign(row, decimals({ ...args.data }, ['totalAmount']));
        return row;
      },
      aggregate: async (args: {
        where: { departureId: string; id: { not: string }; status: { not: string } };
      }) => ({
        _sum: {
          partySize: state.reservations
            .filter(
              (row) =>
                row.departureId === args.where.departureId &&
                row.id !== args.where.id.not &&
                row.status !== args.where.status.not,
            )
            .reduce((sum, row) => sum + (row.partySize as number), 0),
        },
      }),
    },
    reservationRoom: {
      deleteMany: async (args: { where: { reservationId: string } }) => {
        const gone = new Set(
          state.rooms
            .filter((room) => room.reservationId === args.where.reservationId)
            .map((room) => room.id),
        );
        state.rooms = state.rooms.filter((room) => !gone.has(room.id));
        for (const traveler of state.travelers) {
          if (gone.has(traveler.roomId as string)) traveler.roomId = null;
        }
      },
      createMany: async (args: { data: Row[] }) => {
        state.rooms.push(...args.data.map((room) => ({ ...room })));
      },
    },
    reservationTraveler: {
      findUnique: async (args: { where: { id: string } }) =>
        state.travelers.find((traveler) => traveler.id === args.where.id) ?? null,
      deleteMany: async (args: {
        where: { reservationId: string; id: { notIn: string[] } };
      }) => {
        state.travelers = state.travelers.filter(
          (traveler) =>
            traveler.reservationId !== args.where.reservationId ||
            args.where.id.notIn.includes(traveler.id),
        );
      },
      update: async (args: { where: { id: string }; data: Row }) => {
        const row = state.travelers.find((traveler) => traveler.id === args.where.id)!;
        Object.assign(row, args.data);
        return row;
      },
      create: async (args: { data: Row }) => {
        const row = { passportNumberEnc: null, ...args.data };
        state.travelers.push(row);
        return row;
      },
    },
    reservationExtra: {
      create: async (args: { data: Row }) => {
        const row = decimals({ ...args.data }, ['unitAmount', 'amount']);
        state.extras.push(row);
        return row;
      },
      update: async (args: { where: { id: string }; data: Row }) => {
        const row = state.extras.find((extra) => extra.id === args.where.id)!;
        Object.assign(row, decimals({ ...args.data }, ['amount']));
        return row;
      },
      delete: async (args: { where: { id: string } }) => {
        state.extras = state.extras.filter((extra) => extra.id !== args.where.id);
      },
    },
    reservationPriceLine: {
      deleteMany: async (args: { where: { reservationId: string } }) => {
        state.lines = state.lines.filter(
          (line) => line.reservationId !== args.where.reservationId,
        );
      },
      createMany: async (args: { data: Row[] }) => {
        state.lines.push(
          ...args.data.map((line) =>
            decimals({ ...line, id: randomUUID() }, ['quantity', 'unitAmount', 'amount']),
          ),
        );
      },
    },
    auditLog: {
      create: async (args: { data: Row }) => {
        const row = { ...args.data, id: randomUUID() };
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
    headers['x-test-user'] === OPS.email
      ? {
          user: { id: OPS.id, email: OPS.email, role: OPS.role },
          session: { id: 'session-1', userId: OPS.id, expiresAt: new Date() },
        }
      : null,
};

const party = {
  tierId: TIER_COMFORT,
  departureId: DEPARTURE,
  rooms: [
    { label: 'Double', capacity: 2 },
    { label: 'Single', capacity: 1 },
  ],
  travelers: [
    {
      fullName: 'Margaret Chen',
      isLead: true,
      nationality: 'ca',
      passportNumber: 'AB 123 456',
      passportExpiresAt: '2031-05-01',
      emergencyContactName: 'Laura Chen',
      emergencyContactPhone: '+1 604 555 0199',
      room: 1,
    },
    { fullName: 'David Chen', room: 0 },
    { fullName: 'Emma Chen', kind: 'CHILD', dateOfBirth: '2018-06-01', room: 0 },
  ],
};

async function buildApp(state: State, key: Buffer | null): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(createFakePrisma(state))
    .overrideProvider(AuthService)
    .useValue(fakeAuthService)
    .overrideProvider(TENANT_CONFIG)
    .useValue(tenant)
    .overrideProvider(PASSPORT_KEY)
    .useValue(key)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('travelers API (M2)', () => {
  let app: INestApplication;
  let state: State;

  beforeEach(async () => {
    state = seed();
    app = await buildApp(state, randomBytes(32));
  });

  afterEach(async () => {
    await app.close();
  });

  const as = () => ({ 'x-test-user': OPS.email });
  const putParty = (id: string, body: unknown) =>
    request(app.getHttpServer())
      .put(`/reservations/${id}/travelers`)
      .set(as())
      .send(body);

  it('starts a package booking unpriced, with no travelers, rooms or extras', async () => {
    const response = await request(app.getHttpServer())
      .get(`/reservations/${PACKAGE_BOOKING}/travelers`)
      .set(as())
      .expect(200);

    expect(response.body).toMatchObject({
      partySize: 1,
      priced: true,
      priceLocked: false,
      rooms: [],
      travelers: [],
      extras: [],
    });
  });

  it('replaces the party and freezes its price lines and total', async () => {
    const response = await putParty(PACKAGE_BOOKING, party).expect(200);

    expect(response.body.partySize).toBe(3);
    expect(response.body.rooms.map((room: { label: string }) => room.label)).toEqual([
      'Double',
      'Single',
    ]);
    const [lead, , child] = response.body.travelers;
    expect(lead).toMatchObject({ isLead: true, nationality: 'CA', hasPassport: true });
    expect(lead.roomId).toBe(response.body.rooms[1].id);
    expect(child).toMatchObject({ kind: 'CHILD', dateOfBirth: '2018-06-01' });

    const lines = await request(app.getHttpServer())
      .get(`/reservations/${PACKAGE_BOOKING}/price-lines`)
      .set(as())
      .expect(200);
    // 2 adults at the departure price + Comfort; Emma (8) at 60 % of 1 395;
    // one single room; the tourist card per traveler and the service fee.
    expect(
      lines.body.lines.map((line: { kind: string; amount: string }) => [
        line.kind,
        line.amount,
      ]),
    ).toEqual([
      ['BASE', '2550.00'],
      ['TIER', '240.00'],
      ['CHILD', '837.00'],
      ['SINGLE_SUPPLEMENT', '380.00'],
      ['FEE', '75.00'],
      ['FEE', '100.00'],
    ]);
    expect(lines.body.total).toBe('4182.00');
    expect(lines.body.lines[2].travelerId).toBe(child.id);

    const booking = state.reservations.find((row) => row.id === PACKAGE_BOOKING)!;
    expect(String(booking.totalAmount)).toBe('4182');
    expect(booking).toMatchObject({ tierId: TIER_COMFORT, departureId: DEPARTURE });
  });

  it('stores the passport number only as ciphertext and never lists it', async () => {
    const response = await putParty(PACKAGE_BOOKING, party).expect(200);

    const stored = state.travelers.find(
      (traveler) => traveler.fullName === 'Margaret Chen',
    )!;
    expect(stored.passportNumberEnc).toMatch(/^v1\./);
    expect(JSON.stringify(stored)).not.toContain('AB123456');
    expect(JSON.stringify(response.body)).not.toContain('AB123456');

    const audit = state.audits.find(
      (entry) => entry.action === 'reservation.party_updated',
    )!;
    expect(audit.metadata).toMatchObject({
      travelers: 3,
      passportsSet: 1,
      repriced: true,
    });
    expect(JSON.stringify(audit.metadata)).not.toMatch(/AB123456|Margaret/);
  });

  it('reveals a passport through the vault route, audited and uncached', async () => {
    const saved = await putParty(PACKAGE_BOOKING, party).expect(200);
    const lead = saved.body.travelers[0];

    const response = await request(app.getHttpServer())
      .get(`/reservations/${PACKAGE_BOOKING}/travelers/${lead.id}/passport`)
      .set(as())
      .expect(200);

    expect(response.body).toEqual({
      travelerId: lead.id,
      passportNumber: 'AB123456',
      passportExpiresAt: '2031-05-01',
    });
    expect(response.headers['cache-control']).toBe('no-store');
    const audit = state.audits.find(
      (entry) => entry.action === 'traveler.passport_viewed',
    );
    expect(audit).toMatchObject({
      actorUserId: OPS.id,
      entityId: PACKAGE_BOOKING,
      metadata: { travelerId: lead.id },
    });
  });

  it('keeps the stored passport when an update leaves the number out', async () => {
    const saved = await putParty(PACKAGE_BOOKING, party).expect(200);
    const before = state.travelers.find((traveler) => traveler.isLead)!.passportNumberEnc;

    const travelers = saved.body.travelers.map(
      (traveler: {
        id: string;
        fullName: string;
        kind: string;
        dateOfBirth: string | null;
      }) => ({
        id: traveler.id,
        fullName: traveler.fullName,
        kind: traveler.kind,
        dateOfBirth: traveler.dateOfBirth,
      }),
    );
    travelers[0].isLead = true;
    await putParty(PACKAGE_BOOKING, {
      tierId: TIER_COMFORT,
      departureId: DEPARTURE,
      travelers,
    }).expect(200);

    expect(state.travelers.find((traveler) => traveler.isLead)!.passportNumberEnc).toBe(
      before,
    );
  });

  it('refuses a passport read for a traveler of another booking', async () => {
    const saved = await putParty(PACKAGE_BOOKING, party).expect(200);

    await request(app.getHttpServer())
      .get(
        `/reservations/${CUSTOM_BOOKING}/travelers/${saved.body.travelers[0].id}/passport`,
      )
      .set(as())
      .expect(404);
  });

  it('prices a package extra per traveler and reprices when it is removed', async () => {
    await putParty(PACKAGE_BOOKING, party).expect(200);

    const added = await request(app.getHttpServer())
      .post(`/reservations/${PACKAGE_BOOKING}/extras`)
      .set(as())
      .send({ packageExtraId: PACKAGE_EXTRA })
      .expect(201);
    expect(added.body).toMatchObject({
      packageExtraId: PACKAGE_EXTRA,
      label: 'Horseback half day',
      unit: 'PER_PERSON',
      unitAmount: '60.00',
      amount: '180.00',
    });
    let lines = await request(app.getHttpServer())
      .get(`/reservations/${PACKAGE_BOOKING}/price-lines`)
      .set(as());
    expect(lines.body.total).toBe('4362.00');

    await request(app.getHttpServer())
      .delete(`/reservations/${PACKAGE_BOOKING}/extras/${added.body.id}`)
      .set(as())
      .expect(204);
    lines = await request(app.getHttpServer())
      .get(`/reservations/${PACKAGE_BOOKING}/price-lines`)
      .set(as());
    expect(lines.body.total).toBe('4182.00');
    expect(state.audits.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['reservation.extra_added', 'reservation.extra_removed']),
    );
  });

  it('prices an unnamed booking as its party size when an extra is added', async () => {
    const added = await request(app.getHttpServer())
      .post(`/reservations/${PACKAGE_BOOKING}/extras`)
      .set(as())
      .send({ label: 'Birthday cake', unit: 'PER_BOOKING', unitAmount: 18 })
      .expect(201);

    expect(added.body.amount).toBe('18.00');
    // 1 000 base + 18 cake + 25 tourist card + 100 service fee.
    const booking = state.reservations.find((row) => row.id === PACKAGE_BOOKING)!;
    expect(String(booking.totalAmount)).toBe('1143');
  });

  it('refuses a repricing change once the payment link locked the price', async () => {
    const saved = await putParty(PACKAGE_BOOKING, party).expect(200);
    state.reservations.find((row) => row.id === PACKAGE_BOOKING)!.status =
      'PENDING_PAYMENT';

    await putParty(PACKAGE_BOOKING, {
      ...party,
      travelers: party.travelers.slice(0, 2),
    }).expect(409);
    await request(app.getHttpServer())
      .post(`/reservations/${PACKAGE_BOOKING}/extras`)
      .set(as())
      .send({ packageExtraId: PACKAGE_EXTRA })
      .expect(409);

    // A correction that does not move the price still goes through.
    const renamed = saved.body.travelers.map(
      (
        traveler: {
          id: string;
          fullName: string;
          kind: string;
          dateOfBirth: string | null;
        },
        index: number,
      ) => ({
        id: traveler.id,
        fullName: index === 1 ? 'David A. Chen' : traveler.fullName,
        kind: traveler.kind,
        dateOfBirth: traveler.dateOfBirth,
        isLead: index === 0,
        room: index === 0 ? 1 : 0,
      }),
    );
    const response = await putParty(PACKAGE_BOOKING, {
      ...party,
      travelers: renamed,
    }).expect(200);
    expect(response.body.priceLocked).toBe(true);
    expect(response.body.travelers[1].fullName).toBe('David A. Chen');
  });

  it('keeps a custom trip at its hand-set total and refuses tiers and extras', async () => {
    await putParty(CUSTOM_BOOKING, { ...party, departureId: null }).expect(400);
    const response = await putParty(CUSTOM_BOOKING, {
      travelers: [{ fullName: 'Ana Pérez', isLead: true }],
    }).expect(200);

    expect(response.body).toMatchObject({ priced: false, partySize: 1 });
    expect(
      String(state.reservations.find((row) => row.id === CUSTOM_BOOKING)!.totalAmount),
    ).toBe('640');
    await request(app.getHttpServer())
      .post(`/reservations/${CUSTOM_BOOKING}/extras`)
      .set(as())
      .send({ label: 'Birthday cake', unitAmount: 18 })
      .expect(409);
  });

  it('refuses a party larger than the places left on the departure', async () => {
    // Three of the four places are already held by another booking.
    await putParty(PACKAGE_BOOKING, { ...party, departureId: SMALL_DEPARTURE }).expect(
      409,
    );
  });

  it('refuses a traveler id that belongs to no one on the booking', async () => {
    await putParty(PACKAGE_BOOKING, {
      travelers: [{ id: randomUUID(), fullName: 'Ghost', isLead: true }],
    }).expect(400);
  });
});

describe('travelers API without a passport key', () => {
  it('stores the party but refuses passport numbers with 503', async () => {
    const state = seed();
    const app = await buildApp(state, null);
    const as = { 'x-test-user': OPS.email };

    await request(app.getHttpServer())
      .put(`/reservations/${PACKAGE_BOOKING}/travelers`)
      .set(as)
      .send(party)
      .expect(503);
    const saved = await request(app.getHttpServer())
      .put(`/reservations/${PACKAGE_BOOKING}/travelers`)
      .set(as)
      .send({
        ...party,
        travelers: party.travelers.map((traveler) => ({
          ...traveler,
          passportNumber: undefined,
        })),
      })
      .expect(200);
    await request(app.getHttpServer())
      .get(
        `/reservations/${PACKAGE_BOOKING}/travelers/${saved.body.travelers[0].id}/passport`,
      )
      .set(as)
      .expect(503);

    await app.close();
  });
});

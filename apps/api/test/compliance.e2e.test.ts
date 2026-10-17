import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { LegalContent } from '@ota/schemas';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { LEGAL_CONTENT } from '../src/compliance/compliance.tokens';
import { PrismaService } from '../src/prisma/prisma.service';
import { OBJECT_STORAGE } from '../src/storage/storage.module';

const USERS = {
  superAdmin: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'admin@example.test',
    role: 'SUPER_ADMIN',
  },
  operations: {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'ops@example.test',
    role: 'OPERATIONS_ADMIN',
  },
  owner: {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'luis@example.test',
    role: 'TRAVELER',
  },
  stranger: {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'other@example.test',
    role: 'TRAVELER',
  },
} as const;

const BOOKING = '55555555-5555-4555-8555-555555555555';
const US_TRAVELER = '66666666-6666-4666-8666-666666666666';
const CA_TRAVELER = '77777777-7777-4777-8777-777777777777';

const STATEMENT = 'I certify that my travel falls under the category above.';
const legal: Record<string, LegalContent> = {
  en: {
    status: 'placeholder',
    ofacStatement: { version: 'ofac@1', text: STATEMENT },
    consents: {
      MARKETING_EMAIL: {
        version: 'marketing@1',
        text: 'Stories and new trips, monthly.',
      },
    },
  },
};

type Row = Record<string, unknown> & { id: string };

interface State {
  reservations: Row[];
  travelers: Row[];
  affidavits: Row[];
  consents: Row[];
  audits: Row[];
  objects: Map<string, { body: Uint8Array; contentType: string }>;
}

function seed(): State {
  return {
    reservations: [
      {
        id: BOOKING,
        userId: USERS.owner.id,
        bookingCode: 'VX7K2M9Q',
        startDate: new Date('2027-02-13T00:00:00Z'),
        endDate: new Date('2027-02-20T00:00:00Z'),
      },
    ],
    travelers: [
      {
        id: US_TRAVELER,
        reservationId: BOOKING,
        position: 0,
        fullName: 'Luis Ortega',
        nationality: 'US',
        usPerson: null,
      },
      {
        id: CA_TRAVELER,
        reservationId: BOOKING,
        position: 1,
        fullName: 'Margaret Chen',
        nationality: 'CA',
        usPerson: null,
      },
    ],
    affidavits: [],
    consents: [],
    audits: [],
    objects: new Map(),
  };
}

function createFakePrisma(state: State) {
  let clock = Date.parse('2026-10-17T10:00:00Z');
  const tick = () => new Date((clock += 1000));
  const affidavitsOf = (where: { travelerId?: string } = {}) =>
    state.affidavits
      .filter((row) => !where.travelerId || row.travelerId === where.travelerId)
      .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());

  const fake = {
    reservation: {
      findFirst: async (args: {
        where: { id: string; userId?: string };
        include?: {
          travelers?: { where?: { id: string } };
          affidavits?: { where?: { travelerId: string } };
        };
      }) => {
        const row = state.reservations.find(
          (candidate) =>
            candidate.id === args.where.id &&
            (!args.where.userId || candidate.userId === args.where.userId),
        );
        if (!row) return null;
        if (!args.include) return { id: row.id };
        const travelers = state.travelers
          .filter((traveler) => traveler.reservationId === row.id)
          .filter(
            (traveler) =>
              !args.include?.travelers?.where ||
              traveler.id === args.include.travelers.where.id,
          );
        const affidavits = affidavitsOf(args.include.affidavits?.where).filter(
          (affidavit) => affidavit.reservationId === row.id,
        );
        return { ...row, travelers, affidavits };
      },
    },
    reservationTraveler: {
      findMany: async (args: { where: { reservationId: string } }) =>
        state.travelers.filter(
          (traveler) => traveler.reservationId === args.where.reservationId,
        ),
    },
    travelerAffidavit: {
      create: async (args: { data: Row }) => {
        const row = {
          documentKey: null,
          ipAddress: null,
          userAgent: null,
          recordedById: null,
          ...args.data,
          id: randomUUID(),
          createdAt: tick(),
        };
        state.affidavits.push(row);
        return row;
      },
      findUnique: async (args: { where: { id: string }; include?: unknown }) => {
        const row = state.affidavits.find((affidavit) => affidavit.id === args.where.id);
        if (!row) return null;
        return args.include
          ? {
              ...row,
              recordedBy: row.recordedById ? { email: USERS.operations.email } : null,
            }
          : row;
      },
      findMany: async (args: { where?: { travelerId?: { in: string[] } } } = {}) =>
        state.affidavits.filter(
          (row) =>
            !args.where?.travelerId ||
            args.where.travelerId.in.includes(row.travelerId as string),
        ),
    },
    consentRecord: {
      findMany: async (args: {
        where: { userId: string };
        orderBy: { createdAt: 'asc' | 'desc' };
      }) => {
        const rows = state.consents.filter((row) => row.userId === args.where.userId);
        const sign = args.orderBy.createdAt === 'asc' ? 1 : -1;
        return rows.sort(
          (a, b) =>
            sign * ((a.createdAt as Date).getTime() - (b.createdAt as Date).getTime()),
        );
      },
      create: async (args: { data: Row }) => {
        const row = {
          region: null,
          ipCountry: null,
          visitorId: null,
          ...args.data,
          id: randomUUID(),
          createdAt: tick(),
        };
        state.consents.push(row);
        return row;
      },
    },
    user: {
      findUnique: async (args: { where: { id: string } }) =>
        Object.values(USERS).find((user) => user.id === args.where.id) ?? null,
    },
    auditLog: {
      create: async (args: { data: Row }) => {
        state.audits.push({ ...args.data, id: randomUUID() });
        return args.data;
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(fake),
  };
  return fake;
}

const fakeAuthService = {
  getSession: async (headers: Record<string, string | string[] | undefined>) => {
    const user = Object.values(USERS).find(
      (candidate) => candidate.email === headers['x-test-user'],
    );
    return user
      ? {
          user: { id: user.id, email: user.email, role: user.role },
          session: { id: 'session-1', userId: user.id, expiresAt: new Date() },
        }
      : null;
  },
};

describe('compliance API (M3)', () => {
  let app: INestApplication;
  let state: State;

  beforeEach(async () => {
    state = seed();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma(state))
      .overrideProvider(AuthService)
      .useValue(fakeAuthService)
      .overrideProvider(LEGAL_CONTENT)
      .useValue(legal)
      .overrideProvider(OBJECT_STORAGE)
      .useValue({
        put: async (key: string, body: Uint8Array, contentType: string) => {
          state.objects.set(key, { body, contentType });
        },
        get: async (key: string) => state.objects.get(key) ?? null,
        delete: async (key: string) => {
          state.objects.delete(key);
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const as = (user: keyof typeof USERS) => ({ 'x-test-user': USERS[user].email });
  const sign = (body: Record<string, unknown>, user: keyof typeof USERS = 'owner') =>
    request(app.getHttpServer())
      .post(`/me/reservations/${BOOKING}/travelers/${US_TRAVELER}/affidavit`)
      .set(as(user))
      .set('user-agent', 'VitestBrowser/1.0')
      .send({
        category: 'SUPPORT_FOR_THE_CUBAN_PEOPLE',
        signature: 'Luis Ortega',
        statementVersion: 'ofac@1',
        ...body,
      });

  it('lists who must certify and the statement in force', async () => {
    const response = await request(app.getHttpServer())
      .get(`/reservations/${BOOKING}/ofac`)
      .set(as('operations'))
      .expect(200);

    expect(response.body).toMatchObject({
      missing: 1,
      statement: { version: 'ofac@1', text: STATEMENT },
      travelers: [
        { travelerId: US_TRAVELER, required: true, affidavit: null },
        { travelerId: CA_TRAVELER, required: false, affidavit: null },
      ],
    });
  });

  it('lets the owner certify online, keeping the statement hash, IP and browser', async () => {
    const response = await sign({ signature: '  luis ORTEGA ' }).expect(201);

    expect(response.body).toMatchObject({
      travelerId: US_TRAVELER,
      source: 'ONLINE',
      hasDocument: false,
    });
    expect(response.body).not.toHaveProperty('ipAddress');
    const stored = state.affidavits[0]!;
    expect(stored).toMatchObject({
      signerName: 'Luis Ortega',
      signerNationality: 'US',
      bookingCode: 'VX7K2M9Q',
      statementVersion: 'ofac@1',
      userAgent: 'VitestBrowser/1.0',
    });
    expect(stored.statementHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.ipAddress).toBeTruthy();
    expect((stored.retainUntil as Date).toISOString()).toBe('2032-02-20T00:00:00.000Z');
    expect(state.audits.map((entry) => entry.action)).toContain('affidavit.signed');

    const status = await request(app.getHttpServer())
      .get(`/me/reservations/${BOOKING}/ofac`)
      .set(as('owner'))
      .expect(200);
    expect(status.body.missing).toBe(0);
  });

  it('refuses a wrong signature, a stale statement, a stranger and a non-US traveler', async () => {
    expect((await sign({ signature: 'Margaret Chen' })).status).toBe(400);
    expect((await sign({ statementVersion: 'ofac@0' })).status).toBe(409);
    expect((await sign({}, 'stranger')).status).toBe(404);
    await request(app.getHttpServer())
      .post(`/me/reservations/${BOOKING}/travelers/${CA_TRAVELER}/affidavit`)
      .set(as('owner'))
      .send({
        category: 'FAMILY_VISITS',
        signature: 'Margaret Chen',
        statementVersion: 'ofac@1',
      })
      .expect(400);
    expect(state.affidavits).toHaveLength(0);
  });

  it('supersedes the previous affidavit instead of changing it', async () => {
    const first = await sign({}).expect(201);
    const second = await sign({ category: 'FAMILY_VISITS' }).expect(201);

    expect(state.affidavits).toHaveLength(2);
    expect(state.affidavits[1]!.supersedesId).toBe(first.body.id);
    const status = await request(app.getHttpServer())
      .get(`/reservations/${BOOKING}/ofac`)
      .set(as('operations'));
    expect(status.body.travelers[0].affidavit.id).toBe(second.body.id);
  });

  it('records a paper affidavit with its scan and serves record and scan audited', async () => {
    const recorded = await request(app.getHttpServer())
      .post(`/reservations/${BOOKING}/travelers/${US_TRAVELER}/affidavit`)
      .set(as('operations'))
      .send({
        category: 'JOURNALISTIC_ACTIVITY',
        signerName: 'Luis A. Ortega',
        signedAt: '2026-10-16T09:00:00Z',
        contentType: 'application/pdf',
        contentBase64: Buffer.from('%PDF-1.4 signed form').toString('base64'),
      })
      .expect(201);
    expect(recorded.body).toMatchObject({
      source: 'PAPER',
      hasDocument: true,
      signerName: 'Luis A. Ortega',
    });

    const record = await request(app.getHttpServer())
      .get(`/affidavits/${recorded.body.id}`)
      .set(as('operations'))
      .expect(200);
    expect(record.body).toMatchObject({
      signature: 'Luis A. Ortega',
      recordedByEmail: USERS.operations.email,
    });
    expect(record.headers['cache-control']).toBe('no-store');

    const scan = await request(app.getHttpServer())
      .get(`/affidavits/${recorded.body.id}/document`)
      .set(as('operations'))
      .expect(200);
    expect(scan.headers['content-type']).toContain('application/pdf');
    expect(state.audits.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        'affidavit.recorded',
        'affidavit.viewed',
        'affidavit.document_viewed',
      ]),
    );
  });

  it('exports every field for a legal request, defusing spreadsheet formulas', async () => {
    await sign({}).expect(201);
    state.affidavits[0]!.signerName = '=HYPERLINK("x")';

    const response = await request(app.getHttpServer())
      .get('/affidavits/export')
      .set(as('superAdmin'))
      .expect(200);

    const [header, line] = response.text.trim().split('\n');
    expect(header).toContain('signature,ip_address,user_agent');
    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
    expect(state.audits.map((entry) => entry.action)).toContain('affidavit.exported');
    await request(app.getHttpServer())
      .get('/affidavits/export')
      .set(as('operations'))
      .expect(403);
  });

  it('records consents against the words in force and keeps the history', async () => {
    const before = await request(app.getHttpServer())
      .get('/me/consents')
      .set(as('owner'))
      .expect(200);
    const marketing = before.body.find(
      (entry: { purpose: string }) => entry.purpose === 'MARKETING_EMAIL',
    );
    expect(marketing).toMatchObject({
      current: null,
      needsConsent: true,
      text: { version: 'marketing@1' },
    });

    const consent = (body: Record<string, unknown>) =>
      request(app.getHttpServer()).post('/me/consents').set(as('owner')).send(body);
    await consent({
      purpose: 'MARKETING_EMAIL',
      granted: true,
      textVersion: 'marketing@1',
    }).expect(201);
    await consent({
      purpose: 'MARKETING_EMAIL',
      granted: false,
      textVersion: 'marketing@1',
    }).expect(201);
    await consent({
      purpose: 'MARKETING_EMAIL',
      granted: true,
      textVersion: 'marketing@0',
    }).expect(409);
    await consent({
      purpose: 'COOKIES_ANALYTICS',
      granted: true,
      textVersion: 'x',
    }).expect(422);

    expect(state.consents[0]).toMatchObject({
      textVersion: 'marketing@1',
      source: 'ACCOUNT',
    });
    expect(state.consents[0]!.textHash).toMatch(/^[0-9a-f]{64}$/);
    const after = await request(app.getHttpServer()).get('/me/consents').set(as('owner'));
    expect(
      after.body.find((entry: { purpose: string }) => entry.purpose === 'MARKETING_EMAIL')
        .current.granted,
    ).toBe(false);

    const log = await request(app.getHttpServer())
      .get(`/customers/${USERS.owner.id}/consents`)
      .set(as('operations'))
      .expect(200);
    expect(log.body.map((entry: { granted: boolean }) => entry.granted)).toEqual([
      false,
      true,
    ]);
  });
});

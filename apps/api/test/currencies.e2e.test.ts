import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { CurrenciesService } from '../src/currencies/currencies.service';
import {
  EcbFxRateProvider,
  MockFxRateProvider,
  createFxRateProvider,
  parseEcbDaily,
  type FxRateProvider,
  type ReferenceRates,
} from '../src/currencies/fx-rate.provider';
import { FX_RATE_PROVIDER } from '../src/currencies/fx-rate.tokens';
import { PrismaService } from '../src/prisma/prisma.service';
import { withNoSettingsVersion } from './fixtures/operating-settings';

const TRAVELER = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'traveler@example.test',
  role: 'TRAVELER',
};
const OPS = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'ops@example.test',
  role: 'OPERATIONS_ADMIN',
};

interface RateRow {
  rateDate: Date;
  currency: string;
  rate: number;
  source: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** A provider whose day and failure the test controls. */
class FixedProvider implements FxRateProvider {
  readonly source = 'mock';
  calls = 0;

  constructor(
    private readonly answer: ReferenceRates | Error = {
      rateDate: today(),
      rates: { USD: 1.087, CAD: 1.4802, GBP: 0.8431, CHF: 0.9354 },
    },
  ) {}

  async latest(): Promise<ReferenceRates> {
    this.calls += 1;
    if (this.answer instanceof Error) throw this.answer;
    return this.answer;
  }
}

function createState() {
  return {
    rates: [] as RateRow[],
    displayCurrency: null as string | null,
    audits: [] as { action: string; metadata: unknown }[],
  };
}

function createFakePrisma(state: ReturnType<typeof createState>) {
  const fake = withNoSettingsVersion({
    exchangeRate: {
      findFirst: async () =>
        [...state.rates].sort((a, b) => b.rateDate.getTime() - a.rateDate.getTime())[0] ??
        null,
      findMany: async (args: { where: { rateDate: Date } }) =>
        state.rates.filter(
          (row) => row.rateDate.getTime() === args.where.rateDate.getTime(),
        ),
      createMany: async (args: { data: RateRow[]; skipDuplicates: boolean }) => {
        const fresh = args.data.filter(
          (row) =>
            !state.rates.some(
              (stored) =>
                stored.currency === row.currency &&
                stored.rateDate.getTime() === row.rateDate.getTime(),
            ),
        );
        state.rates.push(...fresh);
        return { count: fresh.length };
      },
    },
    user: {
      findUniqueOrThrow: async () => ({ displayCurrency: state.displayCurrency }),
      update: async (args: { data: { displayCurrency: string } }) => {
        state.displayCurrency = args.data.displayCurrency;
        return {};
      },
    },
    auditLog: {
      create: async (args: { data: { action: string; metadata: unknown } }) => {
        state.audits.push({ action: args.data.action, metadata: args.data.metadata });
        return args.data;
      },
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  });
  return fake;
}

const fakeAuthService = {
  getSession: async (headers: Record<string, string | string[] | undefined>) => {
    const user = [TRAVELER, OPS].find(
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

describe('display currencies API (docs/schema-m9-display-currencies.md)', () => {
  let app: INestApplication;
  let state: ReturnType<typeof createState>;

  async function boot(provider: FxRateProvider = new FixedProvider()) {
    state = createState();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma(state))
      .overrideProvider(AuthService)
      .useValue(fakeAuthService)
      .overrideProvider(FX_RATE_PROVIDER)
      .useValue(provider)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }

  afterEach(async () => {
    await app?.close();
  });

  describe('the public rates (C5a)', () => {
    it('stores the first read of the day and serves the currencies on, spread included', async () => {
      const provider = new FixedProvider();
      await boot(provider);

      const response = await request(app.getHttpServer()).get('/catalog/currencies');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        base: 'EUR',
        rateDate: today(),
        lockAt: 'DEPOSIT',
        // CHF is off by default; each rate is the reference plus 0.6 %.
        currencies: [
          { code: 'USD', rate: 1.093522 },
          { code: 'CAD', rate: 1.489081 },
          { code: 'GBP', rate: 0.848159 },
        ],
      });
      expect(state.rates).toHaveLength(4);

      await request(app.getHttpServer()).get('/catalog/currencies').expect(200);
      expect(provider.calls).toBe(1);
    });

    it('shows EUR only when the latest rate is more than five days old', async () => {
      await boot(new FixedProvider({ rateDate: daysAgo(6), rates: { CAD: 1.4802 } }));

      const response = await request(app.getHttpServer()).get('/catalog/currencies');

      expect(response.body).toMatchObject({ rateDate: null, currencies: [] });
    });

    it('answers EUR only when the provider fails and nothing is stored', async () => {
      await boot(new FixedProvider(new Error('ECB unreachable')));

      const response = await request(app.getHttpServer()).get('/catalog/currencies');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ rateDate: null, currencies: [] });
    });
  });

  describe('an email\'s "about" rate (C7b)', () => {
    const lock = {
      currency: 'GBP' as const,
      rate: 0.85,
      rateDate: '2026-10-14',
      lockedAt: '2026-10-14T09:30:00.000Z',
    };

    it("uses today's rate for the traveler's currency, with the lock point", async () => {
      await boot();
      const currencies = app.get(CurrenciesService);

      expect(await currencies.emailReference('CAD', null)).toEqual({
        currency: 'CAD',
        rate: 1.489081,
        lockedAt: null,
        lockAt: 'DEPOSIT',
      });
      expect(await currencies.emailReference('EUR', null)).toBeNull();
      expect(await currencies.emailReference(null, null)).toBeNull();
      // CHF is off by default.
      expect(await currencies.emailReference('CHF', null)).toBeNull();
    });

    it("keeps the booking's locked rate, even when today's rates are stale", async () => {
      await boot(new FixedProvider({ rateDate: daysAgo(6), rates: { CAD: 1.4802 } }));
      const currencies = app.get(CurrenciesService);

      expect(await currencies.emailReference('CAD', null)).toBeNull();
      expect(await currencies.emailReference('CAD', lock)).toEqual({
        currency: 'GBP',
        rate: 0.85,
        lockedAt: new Date('2026-10-14T09:30:00.000Z'),
        lockAt: 'DEPOSIT',
      });
    });

    it('answers null when the rates cannot be read, so the email still goes', async () => {
      await boot();
      const currencies = app.get(CurrenciesService);
      const prisma = app.get(PrismaService) as unknown as {
        exchangeRate: { findFirst: () => Promise<unknown> };
      };
      prisma.exchangeRate.findFirst = async () => {
        throw new Error('database unreachable');
      };

      expect(await currencies.emailReference('CAD', null)).toBeNull();
    });
  });

  describe("the desk's currency table (C7a)", () => {
    it('lists every currency, on or off, with its reference and the rate shown', async () => {
      await boot();

      const response = await request(app.getHttpServer())
        .get('/settings/currencies')
        .set('x-test-user', OPS.email);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        source: 'mock',
        rateDate: today(),
        stale: false,
        spreadPercent: 0.6,
        lockAt: 'DEPOSIT',
      });
      expect(response.body.currencies).toContainEqual({
        code: 'CHF',
        enabled: false,
        referenceRate: 0.9354,
        rate: 0.941012,
      });
    });

    it('says the rates are stale rather than hiding them', async () => {
      await boot(new FixedProvider({ rateDate: daysAgo(9), rates: { USD: 1.08 } }));

      const response = await request(app.getHttpServer())
        .get('/settings/currencies')
        .set('x-test-user', OPS.email);

      expect(response.body).toMatchObject({ rateDate: daysAgo(9), stale: true });
    });
  });

  describe("a traveler's choice (C4a)", () => {
    it('saves the choice once and audits the change', async () => {
      await boot();
      const put = (currency: string) =>
        request(app.getHttpServer())
          .put('/me/display-currency')
          .set('x-test-user', TRAVELER.email)
          .send({ currency });

      expect((await put('CAD')).body).toEqual({ currency: 'CAD' });
      await put('CAD').expect(200);

      expect(state.displayCurrency).toBe('CAD');
      expect(state.audits).toEqual([
        { action: 'user.display_currency_changed', metadata: { from: null, to: 'CAD' } },
      ]);
    });

    it('refuses a currency that is not offered', async () => {
      await boot();

      const response = await request(app.getHttpServer())
        .put('/me/display-currency')
        .set('x-test-user', TRAVELER.email)
        .send({ currency: 'JPY' });

      expect(response.status).toBe(400);
      expect(state.displayCurrency).toBeNull();
    });
  });
});

describe('the rate providers (C3a)', () => {
  // The shape of the ECB's eurofxref-daily.xml, shortened.
  const ECB_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <Cube>
    <Cube time='2026-10-30'>
      <Cube currency='USD' rate='1.0870'/>
      <Cube currency='JPY' rate='162.41'/>
      <Cube currency='GBP' rate='0.8431'/>
      <Cube currency='CHF' rate='0.9354'/>
      <Cube currency='CAD' rate='1.4802'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

  it("reads the ECB's day and keeps the display currencies only", () => {
    expect(parseEcbDaily(ECB_SAMPLE)).toEqual({
      rateDate: '2026-10-30',
      rates: { USD: 1.087, GBP: 0.8431, CHF: 0.9354, CAD: 1.4802 },
    });
  });

  it('refuses a response with no day or no display currency', () => {
    expect(() => parseEcbDaily('<html>maintenance</html>')).toThrow(/no day/);
    expect(() =>
      parseEcbDaily(
        "<Cube time='2026-10-30'><Cube currency='JPY' rate='162.41'/></Cube>",
      ),
    ).toThrow(/no display currency/);
  });

  it('uses the mock unless FX_RATE_PROVIDER is ecb', async () => {
    expect(createFxRateProvider({})).toBeInstanceOf(MockFxRateProvider);
    expect(createFxRateProvider({ FX_RATE_PROVIDER: 'ecb' })).toBeInstanceOf(
      EcbFxRateProvider,
    );
    const mock = new MockFxRateProvider(() => new Date('2026-11-02T08:00:00Z'));
    expect(await mock.latest()).toEqual({
      rateDate: '2026-11-02',
      rates: { USD: 1.087, CAD: 1.4802, GBP: 0.8431, CHF: 0.9354 },
    });
  });
});

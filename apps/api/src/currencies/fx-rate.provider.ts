import {
  DISPLAY_CURRENCIES,
  SAMPLE_REFERENCE_RATES,
  type DisplayCurrencyCode,
} from '@ota/domain';

/** One day's reference rates, units per 1 EUR, before the spread. */
export interface ReferenceRates {
  /** The rates' day, YYYY-MM-DD. */
  rateDate: string;
  rates: Partial<Record<DisplayCurrencyCode, number>>;
}

/**
 * Where display rates come from (C3a). Each third party sits behind this
 * interface with a mock until it is chosen (ADR 0006, Q10).
 */
export interface FxRateProvider {
  /** "mock" or "ecb", stored on each rate row. */
  readonly source: string;
  latest(): Promise<ReferenceRates>;
}

/** The board's sample rates, dated today (UTC): the default in dev and e2e. */
export class MockFxRateProvider implements FxRateProvider {
  readonly source = 'mock';

  constructor(private readonly now: () => Date = () => new Date()) {}

  async latest(): Promise<ReferenceRates> {
    return {
      rateDate: this.now().toISOString().slice(0, 10),
      rates: { ...SAMPLE_REFERENCE_RATES },
    };
  }
}

export const ECB_DAILY_URL =
  'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

/**
 * Read the ECB's daily reference XML: the `<Cube time="YYYY-MM-DD">` day and
 * its `<Cube currency="USD" rate="1.0870"/>` rows, keeping the display
 * currencies only. Throws when the day or every rate is missing.
 */
export function parseEcbDaily(xml: string): ReferenceRates {
  const day = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']/.exec(xml)?.[1];
  if (!day) throw new Error('ECB daily rates: no day in the response');
  const rates: Partial<Record<DisplayCurrencyCode, number>> = {};
  for (const match of xml.matchAll(
    /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9.]+)["']/g,
  )) {
    const code = match[1] as DisplayCurrencyCode;
    const rate = Number(match[2]);
    if (DISPLAY_CURRENCIES.includes(code) && Number.isFinite(rate) && rate > 0) {
      rates[code] = rate;
    }
  }
  if (Object.keys(rates).length === 0) {
    throw new Error('ECB daily rates: no display currency in the response');
  }
  return { rateDate: day, rates };
}

/** The ECB's public daily reference rates: no account, no key (C3a). Off unless chosen. */
export class EcbFxRateProvider implements FxRateProvider {
  readonly source = 'ecb';

  constructor(private readonly url: string = ECB_DAILY_URL) {}

  async latest(): Promise<ReferenceRates> {
    const response = await fetch(this.url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      throw new Error(`ECB daily rates: HTTP ${response.status}`);
    }
    return parseEcbDaily(await response.text());
  }
}

/** `FX_RATE_PROVIDER=ecb` selects the ECB reader; anything else is the mock. */
export function createFxRateProvider(
  env: NodeJS.ProcessEnv = process.env,
): FxRateProvider {
  return env.FX_RATE_PROVIDER === 'ecb'
    ? new EcbFxRateProvider()
    : new MockFxRateProvider();
}

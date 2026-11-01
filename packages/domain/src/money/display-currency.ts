/**
 * M9 display currencies (`docs/schema-m9-display-currencies.md` C1–C6). Pure:
 * which currencies a visitor may see, which one they see by default, the rate
 * shown (the day's reference plus the spread), the converted amounts, when a
 * rate is too old to show, and when a booking locks its rate. Every amount
 * charged stays in EUR; a display currency is indicative.
 */

export const BASE_CURRENCY = 'EUR';

export const DISPLAY_CURRENCIES = ['USD', 'CAD', 'GBP', 'CHF'] as const;
export type DisplayCurrencyCode = (typeof DISPLAY_CURRENCIES)[number];

/** EUR or one of the display currencies: what a visitor can pick. */
export type ShownCurrency = typeof BASE_CURRENCY | DisplayCurrencyCode;
export const SHOWN_CURRENCIES: readonly ShownCurrency[] = [BASE_CURRENCY, ...DISPLAY_CURRENCIES];

export function isShownCurrency(value: unknown): value is ShownCurrency {
  return typeof value === 'string' && (SHOWN_CURRENCIES as readonly string[]).includes(value);
}

/**
 * Browser-language regions that default to each currency (C2a, A-Settings
 * "Shown to"). Every other region, Ireland and the euro area included, sees
 * EUR; CHF has no default region, as the board draws it.
 */
export const DISPLAY_CURRENCY_REGIONS: Record<DisplayCurrencyCode, readonly string[]> = {
  USD: ['US'],
  CAD: ['CA'],
  GBP: ['GB'],
  CHF: [],
};

/**
 * The board's sample reference rates (units per 1 EUR, A-Settings): the mock
 * provider's answer every day until a real source is chosen (C3a).
 */
export const SAMPLE_REFERENCE_RATES: Record<DisplayCurrencyCode, number> = {
  USD: 1.087,
  CAD: 1.4802,
  GBP: 0.8431,
  CHF: 0.9354,
};

/** The spread on top of the reference rate, in percent (C5a). */
export const FX_SPREAD_PERCENT = { default: 0.6, min: 0, max: 3 } as const;

/** When a booking locks its rate (C6a, BR-CU-02). */
export const FX_LOCK_POINTS = ['DEPOSIT', 'INVOICE'] as const;
export type FxLockPoint = (typeof FX_LOCK_POINTS)[number];

/** A rate older than this many days is not shown (the ECB skips weekends and holidays). */
export const RATE_STALE_DAYS = 5;

/** The thresholds that switch each display currency on (C2a: CHF off, as drawn). */
export interface DisplayCurrencySwitches {
  displayCurrencyUSD: boolean;
  displayCurrencyCAD: boolean;
  displayCurrencyGBP: boolean;
  displayCurrencyCHF: boolean;
}

export const DEFAULT_DISPLAY_CURRENCY_SWITCHES: DisplayCurrencySwitches = {
  displayCurrencyUSD: true,
  displayCurrencyCAD: true,
  displayCurrencyGBP: true,
  displayCurrencyCHF: false,
};

export function displayCurrencySwitchKey(
  code: DisplayCurrencyCode,
): keyof DisplayCurrencySwitches {
  return `displayCurrency${code}`;
}

/** The display currencies switched on, in the board's order. */
export function enabledDisplayCurrencies(
  switches: DisplayCurrencySwitches,
): DisplayCurrencyCode[] {
  return DISPLAY_CURRENCIES.filter((code) => switches[displayCurrencySwitchKey(code)]);
}

/** The region of each `Accept-Language` tag, most preferred first ("en-CA" → "CA"). */
function preferredRegions(acceptLanguage: string): string[] {
  return acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith('q='));
      const weight = q === undefined ? 1 : Number(q.slice(2));
      return { tag, weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((entry) => entry.tag.split('-').slice(1).find((sub) => /^[A-Za-z]{2}$/.test(sub)))
    .filter((region): region is string => region !== undefined)
    .map((region) => region.toUpperCase());
}

/**
 * The currency a visitor who has not chosen sees (C2a): the first region in
 * their browser languages decides; a region with no enabled currency, or no
 * region at all, sees EUR. No geo-IP.
 */
export function defaultDisplayCurrency(
  acceptLanguage: string | null | undefined,
  enabled: readonly DisplayCurrencyCode[],
): ShownCurrency {
  const [region] = preferredRegions(acceptLanguage ?? '');
  if (region === undefined) return BASE_CURRENCY;
  const match = enabled.find((code) => DISPLAY_CURRENCY_REGIONS[code].includes(region));
  return match ?? BASE_CURRENCY;
}

/**
 * The currency to show (C4a): a signed-in traveler's saved choice, then the
 * cookie, then the default. A choice of a currency since switched off falls
 * through to the next.
 */
export function resolveDisplayCurrency(input: {
  saved?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
  enabled: readonly DisplayCurrencyCode[];
}): ShownCurrency {
  const allowed = (value: string | null | undefined): value is ShownCurrency =>
    value === BASE_CURRENCY ||
    (input.enabled as readonly string[]).includes(value ?? '');
  if (allowed(input.saved)) return input.saved;
  if (allowed(input.cookie)) return input.cookie;
  return defaultDisplayCurrency(input.acceptLanguage, input.enabled);
}

/** The rate shown: the reference plus the spread, to six decimals (C5a). */
export function displayRate(reference: number, spreadPercent: number): number {
  return Math.round(reference * (1 + spreadPercent / 100) * 1e6) / 1e6;
}

/** A euro amount at a rate, to the cent, before any rounding up. */
function toCents(eur: number, rate: number): number {
  return Math.round(eur * rate * 100);
}

/** A browsing or "≈" price: converted and rounded up to the whole unit (DS-Handoff). */
export function convertForDisplay(eur: number, rate: number): number {
  return Math.ceil(toCents(eur, rate) / 100);
}

/** The invoice's reference amount (D-Invoice "CA$ 4,588.62"): converted, to the cent. */
export function referenceAmount(eur: number, rate: number): number {
  return toCents(eur, rate) / 100;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether a rate dated `rateDate` (a UTC calendar day) is too old to show on `now`. */
export function isRateStale(rateDate: Date, now: Date): boolean {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = Date.UTC(
    rateDate.getUTCFullYear(),
    rateDate.getUTCMonth(),
    rateDate.getUTCDate(),
  );
  return (today - day) / DAY_MS > RATE_STALE_DAYS;
}

export type FxLockEvent = 'PAYMENT_LINK' | 'FIRST_PAYMENT';

/**
 * Whether an event locks a booking's rate (C6a). Under DEPOSIT the first
 * confirmed payment locks it; under INVOICE the payment link does, and the
 * first payment still locks a booking whose link came before the setting.
 * The caller never changes a lock that exists.
 */
export function lockDue(lockAt: FxLockPoint, event: FxLockEvent): boolean {
  return event === 'FIRST_PAYMENT' || lockAt === 'INVOICE';
}

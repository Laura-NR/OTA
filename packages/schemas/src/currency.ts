import {
  DISPLAY_CURRENCIES,
  FX_LOCK_POINTS,
  SHOWN_CURRENCIES,
  type DisplayCurrencyCode,
  type FxLockPoint,
  type ShownCurrency,
} from '@ota/domain';
import { z } from 'zod';

/** M9 display currencies (`docs/schema-m9-display-currencies.md`). */

export const displayCurrencyCodeSchema = z.enum([...DISPLAY_CURRENCIES] as [
  DisplayCurrencyCode,
  ...DisplayCurrencyCode[],
]);

export const shownCurrencySchema = z.enum([...SHOWN_CURRENCIES] as [
  ShownCurrency,
  ...ShownCurrency[],
]);

const lockPointSchema = z.enum([...FX_LOCK_POINTS] as [FxLockPoint, ...FxLockPoint[]]);

/**
 * Public `GET /catalog/currencies` (C5a, C7a): the display currencies that
 * are on, each with the rate shown (spread included). Empty when the latest
 * rate is stale, so the storefront shows EUR only.
 */
export const publicCurrenciesSchema = z.object({
  base: z.literal('EUR'),
  /** The rates' day (YYYY-MM-DD), or null when none is fresh. */
  rateDate: z.string().nullable(),
  lockAt: lockPointSchema,
  currencies: z.array(z.object({ code: displayCurrencyCodeSchema, rate: z.number() })),
});

export type PublicCurrenciesDto = z.infer<typeof publicCurrenciesSchema>;

/** Staff `GET /settings/currencies`: A-Settings' table, every currency on or off. */
export const currencySettingsSchema = z.object({
  base: z.literal('EUR'),
  /** "mock" or "ecb". */
  source: z.string(),
  rateDate: z.string().nullable(),
  stale: z.boolean(),
  spreadPercent: z.number(),
  lockAt: lockPointSchema,
  currencies: z.array(
    z.object({
      code: displayCurrencyCodeSchema,
      enabled: z.boolean(),
      /** Units per 1 EUR before the spread; null before the first rate. */
      referenceRate: z.number().nullable(),
      rate: z.number().nullable(),
    }),
  ),
});

export type CurrencySettingsDto = z.infer<typeof currencySettingsSchema>;

/** `PUT /me/display-currency` (C4a). */
export const setDisplayCurrencySchema = z.object({ currency: shownCurrencySchema });

export type SetDisplayCurrencyRequest = z.infer<typeof setDisplayCurrencySchema>;

/** A booking's locked display rate (C6a), spread included. */
export const displayRateLockSchema = z.object({
  currency: displayCurrencyCodeSchema,
  rate: z.number(),
  /** The rate's day (YYYY-MM-DD). */
  rateDate: z.string(),
  lockedAt: z.string(),
});

export type DisplayRateLockDto = z.infer<typeof displayRateLockSchema>;

import {
  BASE_CURRENCY,
  convertForDisplay,
  type FxLockPoint,
  type ShownCurrency,
} from '@ota/domain';
import type { DisplayRateLockDto } from '@ota/schemas';

import { formatMoney } from './format';

/**
 * The visitor's display currency for this request
 * (`docs/schema-m9-display-currencies.md` C4a): the code, the rate shown
 * (spread included; null for EUR), and the currencies the menu offers.
 */
export interface DisplayMoney {
  code: ShownCurrency;
  rate: number | null;
  /** The rates' day (YYYY-MM-DD), or null when only EUR is offered. */
  rateDate: string | null;
  options: { code: ShownCurrency; rate: number | null }[];
  lockAt: FxLockPoint;
  /** Whether the choice is saved on the account too. */
  signedIn: boolean;
}

export const EUR_ONLY: DisplayMoney = {
  code: BASE_CURRENCY,
  rate: null,
  rateDate: null,
  options: [{ code: BASE_CURRENCY, rate: null }],
  lockAt: 'DEPOSIT',
  signedIn: false,
};

/**
 * A browsing price (C1a): a EUR amount in the visitor's display currency,
 * rounded up to the whole unit. EUR, and any amount not in EUR, shows as is.
 */
export function browsingPrice(
  amount: string | number,
  currency: string,
  display: Pick<DisplayMoney, 'code' | 'rate'>,
  locale: string,
): string {
  if (
    currency !== BASE_CURRENCY ||
    display.code === BASE_CURRENCY ||
    display.rate === null
  ) {
    return formatMoney(amount, currency, locale);
  }
  return formatMoney(
    convertForDisplay(Number(amount), display.rate),
    display.code,
    locale,
  );
}

/**
 * The "≈ CA$918" beside a payable EUR amount (C1a), at the booking's locked
 * rate when it has one, else at today's; null when the visitor sees EUR.
 */
export function approxPrice(
  amount: string | number,
  currency: string,
  display: Pick<DisplayMoney, 'code' | 'rate'>,
  locale: string,
  lock: DisplayRateLockDto | null = null,
): string | null {
  const shown = lock ? { code: lock.currency, rate: lock.rate } : display;
  if (currency !== BASE_CURRENCY || shown.code === BASE_CURRENCY || shown.rate === null) {
    return null;
  }
  return `≈ ${formatMoney(convertForDisplay(Number(amount), shown.rate), shown.code, locale)}`;
}

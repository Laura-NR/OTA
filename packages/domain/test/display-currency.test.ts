import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OPERATING_THRESHOLDS,
  convertForDisplay,
  defaultDisplayCurrency,
  displayRate,
  enabledDisplayCurrencies,
  isRateStale,
  isShownCurrency,
  lockDue,
  referenceAmount,
  resolveDisplayCurrency,
} from '../src';

const ALL = ['USD', 'CAD', 'GBP', 'CHF'] as const;

describe('which display currencies are on (docs/schema-m9-display-currencies.md C2)', () => {
  it('starts with USD, CAD and GBP on and CHF off, as the board draws', () => {
    expect(enabledDisplayCurrencies(DEFAULT_OPERATING_THRESHOLDS)).toEqual([
      'USD',
      'CAD',
      'GBP',
    ]);
  });

  it('follows each currency switch', () => {
    expect(
      enabledDisplayCurrencies({
        displayCurrencyUSD: false,
        displayCurrencyCAD: true,
        displayCurrencyGBP: false,
        displayCurrencyCHF: true,
      }),
    ).toEqual(['CAD', 'CHF']);
  });

  it('accepts EUR and the display currencies only', () => {
    expect(isShownCurrency('EUR')).toBe(true);
    expect(isShownCurrency('CAD')).toBe(true);
    expect(isShownCurrency('JPY')).toBe(false);
    expect(isShownCurrency(undefined)).toBe(false);
  });
});

describe('the default display currency (C2a)', () => {
  it('maps the browser language region to its currency', () => {
    expect(defaultDisplayCurrency('en-US,en;q=0.9', ALL)).toBe('USD');
    expect(defaultDisplayCurrency('fr-CA,fr;q=0.8', ALL)).toBe('CAD');
    expect(defaultDisplayCurrency('en-GB', ALL)).toBe('GBP');
  });

  it('shows EUR to Ireland, the euro area and regions with no currency', () => {
    expect(defaultDisplayCurrency('en-IE,en;q=0.9', ALL)).toBe('EUR');
    expect(defaultDisplayCurrency('de-DE', ALL)).toBe('EUR');
    expect(defaultDisplayCurrency('de-CH', ALL)).toBe('EUR');
    expect(defaultDisplayCurrency('ja-JP', ALL)).toBe('EUR');
  });

  it('lets the most preferred tag with a region decide', () => {
    expect(defaultDisplayCurrency('en;q=0.9,fr-CA;q=0.8,en-US;q=0.7', ALL)).toBe('CAD');
    expect(defaultDisplayCurrency('en-US;q=0.5,en-GB;q=0.9', ALL)).toBe('GBP');
  });

  it('reads script subtags and ignores refused tags', () => {
    expect(defaultDisplayCurrency('zh-Hant-US', ALL)).toBe('USD');
    expect(defaultDisplayCurrency('en-US;q=0,en-GB', ALL)).toBe('GBP');
  });

  it('shows EUR when no tag has a region, or there is no header', () => {
    expect(defaultDisplayCurrency('en, fr;q=0.5', ALL)).toBe('EUR');
    expect(defaultDisplayCurrency('*', ALL)).toBe('EUR');
    expect(defaultDisplayCurrency(undefined, ALL)).toBe('EUR');
  });

  it('shows EUR when the region currency is switched off', () => {
    expect(defaultDisplayCurrency('en-US', ['CAD', 'GBP'])).toBe('EUR');
  });
});

describe('choosing the currency to show (C4a)', () => {
  it('prefers the saved choice, then the cookie, then the default', () => {
    expect(
      resolveDisplayCurrency({
        saved: 'GBP',
        cookie: 'CAD',
        acceptLanguage: 'en-US',
        enabled: ALL,
      }),
    ).toBe('GBP');
    expect(
      resolveDisplayCurrency({
        saved: null,
        cookie: 'CAD',
        acceptLanguage: 'en-US',
        enabled: ALL,
      }),
    ).toBe('CAD');
    expect(resolveDisplayCurrency({ acceptLanguage: 'en-US', enabled: ALL })).toBe('USD');
  });

  it('keeps an explicit EUR choice over a regional default', () => {
    expect(
      resolveDisplayCurrency({ cookie: 'EUR', acceptLanguage: 'en-US', enabled: ALL }),
    ).toBe('EUR');
  });

  it('falls through a choice of a currency since switched off, or not offered', () => {
    expect(
      resolveDisplayCurrency({ saved: 'CHF', cookie: 'CAD', enabled: ['USD', 'CAD'] }),
    ).toBe('CAD');
    expect(
      resolveDisplayCurrency({ cookie: 'JPY', acceptLanguage: 'en-GB', enabled: ALL }),
    ).toBe('GBP');
  });
});

describe('the rate shown and the converted amounts (C5a, DS-Handoff)', () => {
  it('adds the spread to the reference rate, to six decimals', () => {
    expect(displayRate(1.4802, 0.6)).toBe(1.489081);
    expect(displayRate(1.087, 0)).toBe(1.087);
  });

  it('rounds a browsing price up to the whole unit', () => {
    expect(convertForDisplay(35, 1.093522)).toBe(39);
    expect(convertForDisplay(620, 1.489081)).toBe(924);
  });

  it('does not round up an exact amount because of floating-point error', () => {
    // 0.1 × 3 is 0.30000000000000004 in binary floating point.
    expect(convertForDisplay(3, 0.1)).toBe(1);
    expect(convertForDisplay(100, 1.5)).toBe(150);
  });

  it('gives the invoice reference to the cent', () => {
    expect(referenceAmount(3100, 1.4802)).toBe(4588.62);
  });
});

describe('a stale rate (C5a)', () => {
  const now = new Date('2026-11-10T09:00:00Z');

  it('shows a rate up to five days old', () => {
    expect(isRateStale(new Date('2026-11-10T00:00:00Z'), now)).toBe(false);
    expect(isRateStale(new Date('2026-11-05T00:00:00Z'), now)).toBe(false);
  });

  it('hides a rate more than five days old', () => {
    expect(isRateStale(new Date('2026-11-04T00:00:00Z'), now)).toBe(true);
  });
});

describe('when a booking locks its rate (C6a, BR-CU-02)', () => {
  it('locks at the first confirmed payment under DEPOSIT, not at the link', () => {
    expect(lockDue('DEPOSIT', 'FIRST_PAYMENT')).toBe(true);
    expect(lockDue('DEPOSIT', 'PAYMENT_LINK')).toBe(false);
  });

  it('locks at the payment link under INVOICE, and still at the first payment', () => {
    expect(lockDue('INVOICE', 'PAYMENT_LINK')).toBe(true);
    expect(lockDue('INVOICE', 'FIRST_PAYMENT')).toBe(true);
  });
});

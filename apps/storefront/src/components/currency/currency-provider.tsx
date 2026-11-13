'use client';

import { CURRENCY_COOKIE, type ShownCurrency } from '@ota/domain';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { useRouter } from '@/i18n/navigation';
import type { DisplayMoney } from '@/lib/display-money';

/** A year, as the other display settings. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

interface CurrencyContextValue {
  display: DisplayMoney;
  /** Whether a change is on its way to the server. */
  pending: boolean;
  choose: (code: ShownCurrency) => Promise<void>;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

/**
 * The visitor's display currency (`docs/schema-m9-display-currencies.md`
 * C4a), as the server resolved it. A choice writes the `ota_currency` cookie,
 * saves it on the account when signed in, and re-renders the page's prices.
 */
export function CurrencyProvider({
  initial,
  children,
}: {
  initial: DisplayMoney;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const choose = useCallback(
    async (code: ShownCurrency) => {
      if (code === initial.code) return;
      document.cookie = `${CURRENCY_COOKIE}=${code}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
      setPending(true);
      try {
        if (initial.signedIn) {
          // The cookie still carries the choice on this device if this fails.
          await fetch('/api/ota/me/display-currency', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ currency: code }),
          }).catch(() => undefined);
        }
        router.refresh();
      } finally {
        setPending(false);
      }
    },
    [initial.code, initial.signedIn, router],
  );

  const value = useMemo(
    () => ({ display: initial, pending, choose }),
    [initial, pending, choose],
  );
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const value = useContext(CurrencyContext);
  if (!value) {
    throw new Error('useCurrency needs a CurrencyProvider');
  }
  return value;
}

/** The display currency and rate, for formatting prices in a client component. */
export function useDisplayMoney(): DisplayMoney {
  return useCurrency().display;
}

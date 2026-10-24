'use client';

import {
  DISPLAY_COOKIE,
  serializeDisplayPreferences,
  type DisplayPreferences,
} from '@ota/domain';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { displayAttributes } from '@/lib/display';

/** A year: the preference is the device's until the traveler changes it. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

interface DisplayContextValue {
  preferences: DisplayPreferences;
  update: (change: Partial<DisplayPreferences>) => void;
}

const DisplayContext = createContext<DisplayContextValue | null>(null);

/**
 * The device's display preferences (Account board, DS 05), seeded from the
 * cookie the server read. A change writes the cookie, so the next page
 * renders in that mode from its first byte, and sets the `<html>` attributes,
 * so this page switches at once.
 */
export function DisplayProvider({
  initial,
  children,
}: {
  initial: DisplayPreferences;
  children: ReactNode;
}) {
  const [preferences, setPreferences] = useState(initial);

  const update = useCallback(
    (change: Partial<DisplayPreferences>) => {
      const next = { ...preferences, ...change };
      const value = serializeDisplayPreferences(next);
      document.cookie = value
        ? `${DISPLAY_COOKIE}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`
        : `${DISPLAY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
      const root = document.documentElement;
      for (const [name, attribute] of Object.entries(displayAttributes(next))) {
        if (attribute) {
          root.setAttribute(name, attribute);
        } else {
          root.removeAttribute(name);
        }
      }
      setPreferences(next);
    },
    [preferences],
  );

  const value = useMemo(() => ({ preferences, update }), [preferences, update]);
  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}

export function useDisplayPreferences(): DisplayContextValue {
  const value = useContext(DisplayContext);
  if (!value) {
    throw new Error('useDisplayPreferences needs a DisplayProvider');
  }
  return value;
}

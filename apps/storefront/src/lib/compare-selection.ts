'use client';

import { useCallback, useEffect, useState } from 'react';

import { MAX_COMPARE } from './compare-limits';

const KEY = 'ota.compare';

function read(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed
          .filter((value): value is string => typeof value === 'string')
          .slice(0, MAX_COMPARE)
      : [];
  } catch {
    return [];
  }
}

function write(slugs: readonly string[]): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(slugs));
  } catch {
    // Storage can be blocked (private mode); the selection then lasts the page.
  }
}

/**
 * The trips picked for Compare, by slug. It lives in the tab's session storage
 * so it survives browsing between Packages and a trip ("we keep your selection
 * while you browse"); it is a convenience, never needed to render a page.
 */
export function useCompareSelection(): {
  selected: string[];
  toggle: (slug: string) => void;
  set: (slugs: readonly string[]) => void;
  clear: () => void;
} {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSelected(read());
  }, []);

  const set = useCallback((slugs: readonly string[]) => {
    const next = [...new Set(slugs)].slice(0, MAX_COMPARE);
    write(next);
    setSelected(next);
  }, []);

  const toggle = useCallback(
    (slug: string) => {
      const current = read();
      set(
        current.includes(slug)
          ? current.filter((value) => value !== slug)
          : current.length >= MAX_COMPARE
            ? current
            : [...current, slug],
      );
    },
    [set],
  );

  const clear = useCallback(() => set([]), [set]);

  return { selected, toggle, set, clear };
}

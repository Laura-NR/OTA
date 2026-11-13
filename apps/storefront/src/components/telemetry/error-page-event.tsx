'use client';

import { useEffect, useRef } from 'react';

import { useTelemetry } from './telemetry-provider';

/**
 * T-Events `error_page_shown` (§05: an error page is where people leave). The
 * path is read in the browser, which the 404 page's server render does not
 * know; characters outside an id are replaced, never sent as typed.
 */
export function ErrorPageEvent({ kind }: { kind: 'not_found' | 'server' }) {
  const { track } = useTelemetry();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) {
      return;
    }
    sent.current = true;
    track('error_page_shown', {
      kind,
      from_path: window.location.pathname
        .replace(/[^A-Za-z0-9_\-:./]/g, '-')
        .slice(0, 96),
    });
  }, [kind, track]);

  return null;
}

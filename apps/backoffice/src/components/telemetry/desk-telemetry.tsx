'use client';

import {
  deskScreenForPath,
  deviceTypeFor,
  networkFor,
  stackHash,
  viewportFor,
  type ParamValue,
  type TelemetryContext,
  type TelemetryEventName,
  type TelemetryInput,
} from '@ota/domain';
import { TELEMETRY_BATCH_MAX } from '@ota/schemas';
import { useLocale } from 'next-intl';
import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import { DESK_DENIED_EVENT, browserApiUrl } from '@/lib/client-api';

type Track = (event: TelemetryEventName, params?: Record<string, ParamValue>) => void;

const DeskTelemetryContext = createContext<Track | null>(null);

const ENDPOINT = browserApiUrl('/telemetry/events');
/** How long events wait for more before a batch goes out. */
const FLUSH_DELAY_MS = 2_000;
/** Events kept while the network is down; older ones are dropped. */
const MAX_QUEUED = 100;
/** Error events per page load, so a failing render cannot flood the sink. */
const MAX_ERRORS = 5;

/**
 * The desk's T-Events shell. The desk offers no analytics choice (owner
 * decision, 2026-10-25), so it sends only the operational events the
 * taxonomy marks for the desk, plus script errors: no page views, no session
 * id and nothing stored on the device. The API adds the operator's role from
 * the session cookie the same-origin rewrite forwards.
 */
export function DeskTelemetryProvider({
  currency,
  children,
}: {
  currency: string;
  children: ReactNode;
}) {
  const locale = useLocale();
  const queue = useRef<TelemetryInput[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errors = useRef(0);

  const flush = useCallback((leaving = false) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    while (queue.current.length > 0) {
      const batch = queue.current.splice(0, TELEMETRY_BATCH_MAX);
      const body = JSON.stringify({ events: batch });
      if (leaving && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
        continue;
      }
      void fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        queue.current = [...batch, ...queue.current].slice(-MAX_QUEUED);
      });
    }
  }, []);

  const track = useCallback<Track>(
    (event, params = {}) => {
      const width = window.innerWidth;
      const connection = (
        navigator as Navigator & { connection?: { effectiveType?: string } }
      ).connection;
      const context: TelemetryContext = {
        app: 'admin',
        screen: deskScreenForPath(window.location.pathname),
        locale,
        currency,
        device_type: deviceTypeFor(width),
        viewport: viewportFor(width),
        network: networkFor(navigator.onLine, connection?.effectiveType),
        consent: 'essential',
      };
      queue.current.push({
        event,
        ts: new Date().toISOString(),
        context: { ...context },
        params,
      });
      queue.current = queue.current.slice(-MAX_QUEUED);
      if (queue.current.length >= TELEMETRY_BATCH_MAX) {
        flush();
      } else if (!timer.current) {
        timer.current = setTimeout(() => flush(), FLUSH_DELAY_MS);
      }
    },
    [currency, flush, locale],
  );

  useEffect(() => {
    function onHidden() {
      if (document.visibilityState === 'hidden') {
        flush(true);
      }
    }
    function onLeave() {
      flush(true);
    }
    function onError(message: string) {
      if (errors.current >= MAX_ERRORS) {
        return;
      }
      errors.current += 1;
      track('client_error', { stack_hash: stackHash(message) });
    }
    function onWindowError(event: ErrorEvent) {
      onError(`${event.message}\n${event.filename}:${event.lineno}`);
    }
    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason as unknown;
      onError(
        reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason),
      );
    }
    function onDenied() {
      track('admin_state_shown', { kind: 'denied' });
    }

    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener(DESK_DENIED_EVENT, onDenied);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener(DESK_DENIED_EVENT, onDenied);
      flush(true);
    };
  }, [flush, track]);

  return (
    <DeskTelemetryContext.Provider value={track}>
      {children}
    </DeskTelemetryContext.Provider>
  );
}

/**
 * Report a desk event. Outside the signed-in desk (the sign-in and invite
 * pages) there is no shell, and the call does nothing.
 */
export function useDeskTelemetry(): Track {
  return useContext(DeskTelemetryContext) ?? noop;
}

function noop(): void {}

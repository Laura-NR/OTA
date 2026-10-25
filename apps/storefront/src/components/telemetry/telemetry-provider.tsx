'use client';

import {
  TELEMETRY_EVENTS,
  consentLevel,
  cookiePermissions,
  deviceTypeFor,
  needsCookieChoice,
  networkFor,
  parseCookieChoice,
  screenForPath,
  stackHash,
  viewportFor,
  type ConsentLevel,
  type CookieChoice,
  type CookiePermissions,
  type ParamValue,
  type TelemetryContext,
  type TelemetryEventName,
  type TelemetryInput,
} from '@ota/domain';
import { TELEMETRY_BATCH_MAX } from '@ota/schemas';
import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import {
  TELEMETRY_ENDPOINT,
  TELEMETRY_SESSION_KEY,
  declaredEvent,
  textVersions,
  writeConsentCookie,
  type CookieTexts,
} from '@/lib/telemetry';

import { CookieBanner } from './cookie-banner';

export type ConsentSource = 'banner' | 'settings';

export interface CookieSelection {
  analytics: boolean;
  marketing: boolean;
}

interface TelemetryContextValue {
  /** Queue one event; dropped unless consented or essential. */
  track: (event: TelemetryEventName, params?: Record<string, ParamValue>) => void;
  choice: CookieChoice | null;
  permissions: CookiePermissions;
  texts: CookieTexts;
  save: (selection: CookieSelection, source: ConsentSource) => void;
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

/** How long events wait for more before a batch goes out. */
const FLUSH_DELAY_MS = 2_000;
/** Events kept while the network is down; older ones are dropped. */
const MAX_QUEUED = 100;
/** Error events per page load, so a failing render cannot flood the sink. */
const MAX_ERRORS = 5;

function randomSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `s_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The T-Events shell (Phase 8 item 1): it owns the cookie choice (DS 04
 * consent) and the event queue, adds the common parameters to every event,
 * and reads `data-analytics-*` on clicks so components never hand-write a
 * tracking call for a plain click. Analytics events go out only with the
 * analytics consent; essential ones (bookings, payments, errors, the choice
 * itself) always, without the session id. A signed-in traveler's choice is
 * also written to the consent log, which keeps the evidence; the cookie is
 * what this device obeys.
 */
export function TelemetryProvider({
  initialCookie,
  texts,
  signedIn,
  currency,
  locales,
  children,
}: {
  /** The `ota_consent` cookie as the server read it. */
  initialCookie: string | null;
  texts: CookieTexts;
  signedIn: boolean;
  currency: string;
  locales: readonly string[];
  children: ReactNode;
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const [choice, setChoice] = useState(() => parseCookieChoice(initialCookie));
  const versions = useMemo(() => textVersions(texts), [texts]);
  const permissions = useMemo(
    () => cookiePermissions(choice, versions),
    [choice, versions],
  );
  const level = useRef<ConsentLevel>(consentLevel(permissions));
  level.current = consentLevel(permissions);

  const queue = useRef<TelemetryInput[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const memorySession = useRef<string | null>(null);
  const lastPath = useRef<string | null>(null);
  const viewSent = useRef(false);
  const errors = useRef(0);

  const sessionId = useCallback((): string => {
    try {
      const kept = window.sessionStorage.getItem(TELEMETRY_SESSION_KEY);
      if (kept) {
        return kept;
      }
      const created = randomSessionId();
      window.sessionStorage.setItem(TELEMETRY_SESSION_KEY, created);
      return created;
    } catch {
      // Storage refused (a private window): keep one id for this page instead.
      memorySession.current ??= randomSessionId();
      return memorySession.current;
    }
  }, []);

  const flush = useCallback((leaving = false) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    while (queue.current.length > 0) {
      const batch = queue.current.splice(0, TELEMETRY_BATCH_MAX);
      const body = JSON.stringify({ events: batch });
      // A page being left cannot wait for a response; a beacon outlives it.
      if (leaving && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(
          TELEMETRY_ENDPOINT,
          new Blob([body], { type: 'application/json' }),
        );
        continue;
      }
      void fetch(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        // The network is down: keep the batch for the next flush.
        queue.current = [...batch, ...queue.current].slice(-MAX_QUEUED);
      });
    }
  }, []);

  const track = useCallback(
    (event: TelemetryEventName, params: Record<string, ParamValue> = {}) => {
      const consent = level.current;
      if (consent === 'essential' && !TELEMETRY_EVENTS[event].essential) {
        return;
      }
      const width = window.innerWidth;
      const device = deviceTypeFor(width);
      const connection = (
        navigator as Navigator & { connection?: { effectiveType?: string } }
      ).connection;
      const context: TelemetryContext = {
        ...(consent === 'essential' ? {} : { session_id: sessionId() }),
        app: device === 'phone' ? 'mobile_web' : 'web',
        screen: screenForPath(window.location.pathname, locales),
        locale,
        currency,
        device_type: device,
        viewport: viewportFor(width),
        network: networkFor(navigator.onLine, connection?.effectiveType),
        consent,
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
    [currency, flush, locale, locales, sessionId],
  );

  const pageView = useCallback(() => {
    const params: Record<string, ParamValue> = { entry: !viewSent.current };
    if (!viewSent.current) {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      if (referrer && referrer.host !== window.location.host) {
        params.referrer_host = referrer.hostname;
      }
      const search = new URLSearchParams(window.location.search);
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
        const value = search.get(key);
        if (value && /^[A-Za-z0-9_\-.+]{1,64}$/.test(value)) {
          params[key] = value;
        }
      }
    }
    if (level.current !== 'essential') {
      viewSent.current = true;
    }
    track('page_view', params);
  }, [track]);

  // One page_view per screen render; filter changes in the query are not views.
  useEffect(() => {
    if (lastPath.current === pathname) {
      return;
    }
    lastPath.current = pathname;
    pageView();
  }, [pathname, pageView]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-analytics-event]')
          : null;
      const declared = target ? declaredEvent(target) : null;
      if (!target || !declared) {
        return;
      }
      if (
        declared.event === 'nav_clicked' &&
        declared.params.to_screen === undefined &&
        target instanceof HTMLAnchorElement
      ) {
        const url = new URL(target.href);
        if (url.origin !== window.location.origin) {
          return;
        }
        declared.params.to_screen = screenForPath(url.pathname, locales);
      }
      track(declared.event, declared.params);
    }
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
    let offlineSince: number | null = navigator.onLine ? null : Date.now();
    function onOffline() {
      offlineSince = Date.now();
      track('offline_mode_entered');
    }
    function onOnline() {
      const seconds =
        offlineSince === null ? 0 : Math.round((Date.now() - offlineSince) / 1000);
      offlineSince = null;
      track('offline_mode_left', { duration_s: seconds });
      flush();
    }

    document.addEventListener('click', onClick, true);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [flush, locales, track]);

  const save = useCallback(
    (selection: CookieSelection, source: ConsentSource) => {
      const next: CookieChoice = {
        analytics: selection.analytics && versions.analytics !== null,
        marketing: selection.marketing && versions.marketing !== null,
        analyticsVersion: versions.analytics,
        marketingVersion: versions.marketing,
        savedAt: new Date(),
      };
      writeConsentCookie(next);
      setChoice(next);
      level.current = consentLevel(cookiePermissions(next, versions));
      if (level.current === 'essential') {
        // A withdrawal also takes back what is still queued.
        queue.current = queue.current
          .filter(
            (input) => TELEMETRY_EVENTS[input.event as TelemetryEventName].essential,
          )
          .map((input) => {
            const context: Record<string, unknown> = {
              ...input.context,
              consent: 'essential',
            };
            delete context.session_id;
            return { ...input, context };
          });
        try {
          window.sessionStorage.removeItem(TELEMETRY_SESSION_KEY);
        } catch {
          // Storage refused: there is no stored id to remove.
        }
        memorySession.current = null;
      }
      track('consent_set', {
        analytics: next.analytics,
        marketing: next.marketing,
        source,
      });
      if (level.current !== 'essential' && !viewSent.current) {
        pageView();
      }
      flush();

      if (signedIn) {
        // The consent log (M3) keeps the evidence of a signed-in traveler's
        // choice. A failed write leaves the device's choice in force; the
        // log catches up the next time the traveler chooses.
        const purposes = [
          {
            purpose: 'COOKIES_ANALYTICS',
            text: texts.analytics,
            granted: next.analytics,
          },
          {
            purpose: 'COOKIES_MARKETING',
            text: texts.marketing,
            granted: next.marketing,
          },
        ] as const;
        for (const { purpose, text, granted } of purposes) {
          if (!text) {
            continue;
          }
          void fetch('/api/ota/me/consents', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              purpose,
              granted,
              textVersion: text.version,
              source: 'COOKIE_BANNER',
              locale,
            }),
          }).catch(() => undefined);
        }
      }
    },
    [flush, locale, pageView, signedIn, texts, track, versions],
  );

  const value = useMemo(
    () => ({ track, choice, permissions, texts, save }),
    [track, choice, permissions, texts, save],
  );
  const onSettingsPage = screenForPath(pathname, locales) === 'CookieSettings';

  return (
    <TelemetryContext.Provider value={value}>
      {needsCookieChoice(choice, versions) && !onSettingsPage ? <CookieBanner /> : null}
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetry(): TelemetryContextValue {
  const value = useContext(TelemetryContext);
  if (!value) {
    throw new Error('useTelemetry needs a TelemetryProvider');
  }
  return value;
}

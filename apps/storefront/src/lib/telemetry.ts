import {
  CONSENT_COOKIE,
  TELEMETRY_EVENTS,
  isTelemetryEvent,
  serializeCookieChoice,
  type CookieChoice,
  type ParamValue,
  type TelemetryEventName,
} from '@ota/domain';
import type { LegalText } from '@ota/schemas';

/** The words the banner shows per optional purpose; null when the agency offers none. */
export interface CookieTexts {
  analytics: LegalText | null;
  marketing: LegalText | null;
}

/** The T-Events intake, through the same-origin API rewrite. */
export const TELEMETRY_ENDPOINT = '/api/ota/telemetry/events';

/** The tab's analytics session id (sessionStorage, so it ends with the tab). */
export const TELEMETRY_SESSION_KEY = 'ota_telemetry_session';

/** A year: the choice is the device's until the visitor changes it. */
const CONSENT_MAX_AGE = 60 * 60 * 24 * 365;

/** Write the cookie choice on this device. Browser only. */
export function writeConsentCookie(choice: CookieChoice): void {
  document.cookie = `${CONSENT_COOKIE}=${serializeCookieChoice(choice)}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax`;
}

/** The version strings the domain rules compare against. */
export function textVersions(texts: CookieTexts) {
  return {
    analytics: texts.analytics?.version ?? null,
    marketing: texts.marketing?.version ?? null,
  };
}

const camelToSnake = (key: string) =>
  key
    .replace(/^[A-Z]/, (first) => first.toLowerCase())
    .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/**
 * The event an element declares (T-Events §03: `data-analytics-event` plus
 * one `data-analytics-<param>` per parameter) and its parameters, typed by
 * the taxonomy: counts and amounts as numbers, flags as booleans, lists
 * comma-separated. Null when the element names no known event.
 */
export function declaredEvent(
  element: HTMLElement,
): { event: TelemetryEventName; params: Record<string, ParamValue> } | null {
  const name = element.dataset.analyticsEvent;
  if (!name || !isTelemetryEvent(name)) {
    return null;
  }
  const kinds: Readonly<Record<string, unknown>> = TELEMETRY_EVENTS[name].params;
  const params: Record<string, ParamValue> = {};
  for (const [key, raw] of Object.entries(element.dataset)) {
    if (key === 'analyticsEvent' || !key.startsWith('analytics') || raw === undefined) {
      continue;
    }
    const param = camelToSnake(key.slice('analytics'.length));
    const kind = kinds[param];
    if (kind === 'count' || kind === 'amount') {
      params[param] = Number(raw);
    } else if (kind === 'bool') {
      params[param] = raw === 'true';
    } else if (kind === 'ids') {
      params[param] = raw.split(',').filter(Boolean);
    } else {
      params[param] = raw;
    }
  }
  return { event: name, params };
}

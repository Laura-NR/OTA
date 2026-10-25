/**
 * T-Events (analytics event taxonomy, handoff v1.2): one event per user
 * intention, fired on commit (click, submit, change), never on hover or
 * keystroke. Every event carries the shell's common parameters; each event
 * adds only the parameters listed for it here. Identifiers are ids or codes,
 * never titles or free text a person typed, and no name, email, phone or
 * passport number ever enters an event (spec §8.2). This table is the
 * contract the sink enforces: an event or parameter not in it is refused.
 */

/** The seven funnel stages (T-Events §01), renamed for request-to-book. */
export const FUNNEL_STAGES = {
  VISIT: 1,
  DISCOVER: 2,
  CONSIDER: 3,
  CONFIGURE: 4,
  REQUEST: 5,
  PAY: 6,
  CONFIRMED: 7,
} as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[keyof typeof FUNNEL_STAGES];

/** The shape a parameter's value must have. */
export type ParamKind =
  /** An id, code, slug or path: letters, digits and `_-:./`, up to 96 characters. */
  | 'id'
  /** A list of ids, up to 20. */
  | 'ids'
  /** A whole number from 0. */
  | 'count'
  /** An amount of money or a measure, from 0, up to two decimals. */
  | 'amount'
  | 'bool'
  /** A hostname (a referrer is reduced to its host by the shell). */
  | 'host'
  /** A campaign token from a `utm_*` query parameter. */
  | 'token'
  /** One of the listed values. */
  | readonly string[];

export interface TelemetryEventSpec {
  /**
   * Essential events (bookings, payments, errors, the consent choice itself)
   * are logged first-party whatever the cookie choice, without the session
   * id or the user id (T-Events §03).
   */
  essential: boolean;
  params: Readonly<Record<string, ParamKind>>;
}

const SCREEN_IDS = [
  'Home',
  'Destinations',
  'Destination',
  'Packages',
  'Package',
  'Compare',
  'Custom',
  'Booking',
  'Events',
  'Event',
  'Payment',
  'Confirmation',
  'Account',
  'Trip',
  'Proposal',
  'TravelInfo',
  'Blog',
  'BlogPost',
  'About',
  'Support',
  'Join',
  'Legal',
  'CookieSettings',
  'Login',
  'Offline',
  'NotFound',
] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];
export const SCREENS: readonly ScreenId[] = SCREEN_IDS;

const NAVS = ['top', 'bottom', 'footer'] as const;
const LOCALE = /^[a-z]{2}$/;

function event(params: Record<string, ParamKind>, essential = false): TelemetryEventSpec {
  return { essential, params };
}

/** Every event the storefront emits, with its own parameters (T-Events §04, §05). */
export const TELEMETRY_EVENTS = {
  // Shell · every app
  page_view: event({
    referrer_host: 'host',
    utm_source: 'token',
    utm_medium: 'token',
    utm_campaign: 'token',
    entry: 'bool',
  }),
  nav_clicked: event({ to_screen: SCREEN_IDS, nav: NAVS }),
  locale_changed: event({ from: 'id', to: 'id', kind: ['locale', 'currency'] }),
  cta_click: event({ cta: 'id', step: 'count', context_id: 'id' }),
  consent_set: event(
    { analytics: 'bool', marketing: 'bool', source: ['banner', 'settings'] },
    true,
  ),
  offline_mode_entered: event({}),
  offline_mode_left: event({ duration_s: 'count' }),
  // Discover
  map_province_selected: event({ province_id: 'id', source: ['map', 'strip', 'list'] }),
  map_province_unavailable: event({
    province_id: 'id',
    source: ['map', 'strip', 'list'],
  }),
  map_route_added: event({ province_id: 'id', route_length: 'count' }),
  filter_applied: event({
    filter_name: 'id',
    filter_value: 'id',
    active_filters_count: 'count',
  }),
  filter_removed: event({
    filter_name: 'id',
    filter_value: 'id',
    active_filters_count: 'count',
  }),
  search_results_loaded: event({ results_count: 'count', zero_results: 'bool' }),
  search_result_clicked: event({ package_id: 'id', position: 'count' }),
  compare_added: event({ package_id: 'id', count: 'count' }),
  compare_viewed: event({ package_ids: 'ids', count: 'count' }),
  event_banner_clicked: event({ action: ['request_access', 'all_events'] }),
  // Consider
  package_viewed: event({
    package_id: 'id',
    booking_model: ['request', 'instant'],
    price_from: 'amount',
    currency: 'id',
  }),
  specialist_contacted: event({
    channel: ['whatsapp', 'form', 'phone'],
    context_id: 'id',
  }),
  // Configure
  builder_started: event({}),
  builder_step_completed: event({
    from_step: 'count',
    to_step: 'count',
    time_on_step_ms: 'count',
    nights: 'count',
    provinces_count: 'count',
  }),
  proposal_requested: event({
    request_id: 'id',
    nights: 'count',
    provinces: 'ids',
    pace: 'id',
  }),
  booking_started: event({ package_id: 'id' }, true),
  booking_step_completed: event(
    { from_step: 'count', to_step: 'count', time_on_step_ms: 'count' },
    true,
  ),
  // Request
  booking_submitted: event(
    {
      booking_code: 'id',
      package_id: 'id',
      total: 'amount',
      currency: 'id',
      travelers: 'count',
    },
    true,
  ),
  // Pay
  payment_window_viewed: event(
    { booking_code: 'id', method: ['transfer', 'card'] },
    true,
  ),
  // Confirmed and after
  booking_status_viewed: event({ booking_code: 'id', status: 'id' }, true),
  booking_confirmed: event({ booking_code: 'id' }, true),
  document_downloaded: event({ booking_code: 'id', doc_type: 'id' }),
  message_sent: event({
    booking_code: 'id',
    length_bucket: ['short', 'medium', 'long'],
  }),
  csat_submitted: event({ booking_code: 'id', score: 'count' }),
  // Recruitment and concierge
  join_submitted: event({ category: 'id' }),
  concierge_request_submitted: event({ event_id: 'id', tickets: 'count' }),
  // Errors (always logged first-party) and the states where people leave
  client_error: event({ stack_hash: 'id' }, true),
  error_page_shown: event({ kind: ['not_found', 'server'], from_path: 'id' }),
} as const satisfies Record<string, TelemetryEventSpec>;

export type TelemetryEventName = keyof typeof TELEMETRY_EVENTS;

export function isTelemetryEvent(name: string): name is TelemetryEventName {
  return Object.prototype.hasOwnProperty.call(TELEMETRY_EVENTS, name);
}

// ---------------------------------------------------------------------------
// Common parameters (T-Events §02), added by the shell, never by a component.

export const TELEMETRY_APPS = ['web', 'mobile_web'] as const;
export const DEVICE_TYPES = ['phone', 'tablet', 'desktop'] as const;
export const VIEWPORTS = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
export const NETWORKS = ['4g', '3g', '2g', 'offline', 'unknown'] as const;
export const CONSENT_LEVELS = ['essential', 'analytics', 'marketing'] as const;

export type TelemetryApp = (typeof TELEMETRY_APPS)[number];
export type DeviceType = (typeof DEVICE_TYPES)[number];
export type Viewport = (typeof VIEWPORTS)[number];
export type NetworkKind = (typeof NETWORKS)[number];

/** What the client sends with every event. */
export interface TelemetryContext {
  /** `s_` plus hex, from the tab's storage; only with analytics consent. */
  session_id?: string;
  app: TelemetryApp;
  screen: ScreenId;
  locale: string;
  currency: string;
  device_type: DeviceType;
  viewport: Viewport;
  network: NetworkKind;
  consent: (typeof CONSENT_LEVELS)[number];
}

/** DS 07 breakpoints: sm 480, md 768, lg 1024, xl 1280 (mobile first). */
export function viewportFor(width: number): Viewport {
  if (width >= 1280) return 'xl';
  if (width >= 1024) return 'lg';
  if (width >= 768) return 'md';
  if (width >= 480) return 'sm';
  return 'xs';
}

/** Phones are under md, tablets under lg. */
export function deviceTypeFor(width: number): DeviceType {
  if (width >= 1024) return 'desktop';
  if (width >= 768) return 'tablet';
  return 'phone';
}

/** The Network Information API's rating, reduced to the board's values. */
export function networkFor(
  online: boolean,
  effectiveType: string | undefined,
): NetworkKind {
  if (!online) return 'offline';
  switch (effectiveType) {
    case '4g':
      return '4g';
    case '3g':
      return '3g';
    case '2g':
    case 'slow-2g':
      return '2g';
    default:
      return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Screens: each knows its funnel stage (T-Events §01).

const SCREEN_STAGES: Readonly<Record<ScreenId, FunnelStage | null>> = {
  Home: 1,
  Blog: 1,
  BlogPost: 1,
  About: 1,
  TravelInfo: 1,
  Support: 1,
  Destinations: 2,
  Packages: 2,
  Events: 2,
  Destination: 3,
  Package: 3,
  Compare: 3,
  Event: 3,
  Custom: 4,
  Booking: 4,
  Proposal: 5,
  Payment: 6,
  Confirmation: 7,
  Account: 7,
  Trip: 7,
  Join: null,
  Legal: null,
  CookieSettings: null,
  Login: null,
  Offline: null,
  NotFound: null,
};

export function funnelStageOf(screen: ScreenId): FunnelStage | null {
  return SCREEN_STAGES[screen];
}

/** Path patterns after the locale prefix, most specific first. */
const SCREEN_PATHS: readonly [RegExp, ScreenId][] = [
  [/^\/$/, 'Home'],
  [/^\/destinations\/?$/, 'Destinations'],
  [/^\/destinations\/[^/]+\/?$/, 'Destination'],
  [/^\/packages\/?$/, 'Packages'],
  [/^\/packages\/compare\/?$/, 'Compare'],
  [/^\/packages\/[^/]+\/book\/?$/, 'Booking'],
  [/^\/packages\/[^/]+\/?$/, 'Package'],
  [/^\/custom\/?$/, 'Custom'],
  [/^\/events\/?$/, 'Events'],
  [/^\/events\/[^/]+\/?$/, 'Event'],
  [/^\/checkout\/[^/]+\/[^/]+\/?$/, 'Payment'],
  [/^\/account\/reservations\/[^/]+\/confirmation\/?$/, 'Confirmation'],
  [/^\/account\/reservations\/[^/]+\/?$/, 'Trip'],
  [/^\/account\/proposals\/[^/]+\/?$/, 'Proposal'],
  [/^\/account\/?$/, 'Account'],
  [/^\/travel-info\/?$/, 'TravelInfo'],
  [/^\/blog\/?$/, 'Blog'],
  [/^\/blog\/[^/]+\/?$/, 'BlogPost'],
  [/^\/about\/?$/, 'About'],
  [/^\/support\/?$/, 'Support'],
  [/^\/join\/?$/, 'Join'],
  [/^\/legal\/cookies\/?$/, 'CookieSettings'],
  [/^\/legal\/[^/]+\/?$/, 'Legal'],
  [/^\/login\/?$/, 'Login'],
  [/^\/offline\/?$/, 'Offline'],
];

/**
 * The screen a storefront path renders. The locale prefix (`/en`, `/fr`) is
 * dropped first; a path no screen claims is the 404 page.
 */
export function screenForPath(pathname: string, locales: readonly string[]): ScreenId {
  const [first, ...rest] = pathname.split('/').slice(1);
  const path =
    first !== undefined && locales.includes(first) ? `/${rest.join('/')}` : pathname;
  return SCREEN_PATHS.find(([pattern]) => pattern.test(path))?.[1] ?? 'NotFound';
}

// ---------------------------------------------------------------------------
// Admission: what the sink accepts.

export type ParamValue = string | number | boolean | string[];

export interface TelemetryInput {
  event: string;
  /** ISO instant the event happened on the device. */
  ts: string;
  context: Record<string, unknown>;
  params?: Record<string, unknown>;
}

export interface AdmittedEvent {
  event: TelemetryEventName;
  ts: string;
  essential: boolean;
  context: TelemetryContext & { funnel_stage: FunnelStage | null };
  params: Record<string, ParamValue>;
}

export type TelemetryRejection =
  'unknown_event' | 'bad_time' | 'bad_context' | 'bad_param' | 'not_consented';

export type TelemetryVerdict =
  { ok: true; event: AdmittedEvent } | { ok: false; reason: TelemetryRejection };

/** An event may be up to a day old (a tab left open) and a few minutes early (clock skew). */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_SKEW_MS = 5 * 60 * 1000;

const ID = /^[A-Za-z0-9/][A-Za-z0-9_\-:./]{0,95}$/;
const HOST = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}\.)*[A-Za-z0-9-]{1,63}$/;
const TOKEN = /^[A-Za-z0-9_\-.+]{1,64}$/;
const SESSION = /^s_[a-f0-9]{16,32}$/;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_LIST = 20;

function validParam(kind: ParamKind, value: unknown): value is ParamValue {
  if (Array.isArray(kind)) {
    return typeof value === 'string' && kind.includes(value);
  }
  switch (kind) {
    case 'id':
      return typeof value === 'string' && ID.test(value);
    case 'ids':
      return (
        Array.isArray(value) &&
        value.length <= MAX_LIST &&
        value.every((item) => typeof item === 'string' && ID.test(item))
      );
    case 'count':
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    case 'amount':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= 0 &&
        Math.abs(Math.round(value * 100) - value * 100) < 1e-6
      );
    case 'bool':
      return typeof value === 'boolean';
    case 'host':
      return typeof value === 'string' && value.length <= 253 && HOST.test(value);
    case 'token':
      return typeof value === 'string' && TOKEN.test(value);
  }
  return false;
}

const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

function readContext(raw: Record<string, unknown>): TelemetryContext | null {
  const {
    session_id,
    app,
    screen,
    locale,
    currency,
    device_type,
    viewport,
    network,
    consent,
  } = raw;
  const known = new Set([
    'session_id',
    'app',
    'screen',
    'locale',
    'currency',
    'device_type',
    'viewport',
    'network',
    'consent',
  ]);
  if (Object.keys(raw).some((key) => !known.has(key))) {
    return null;
  }
  if (
    !oneOf(TELEMETRY_APPS, app) ||
    !oneOf(SCREEN_IDS, screen) ||
    typeof locale !== 'string' ||
    !LOCALE.test(locale) ||
    typeof currency !== 'string' ||
    !CURRENCY.test(currency) ||
    !oneOf(DEVICE_TYPES, device_type) ||
    !oneOf(VIEWPORTS, viewport) ||
    !oneOf(NETWORKS, network) ||
    !oneOf(CONSENT_LEVELS, consent) ||
    (session_id !== undefined &&
      (typeof session_id !== 'string' || !SESSION.test(session_id)))
  ) {
    return null;
  }
  return {
    ...(typeof session_id === 'string' ? { session_id } : {}),
    app,
    screen,
    locale,
    currency,
    device_type,
    viewport,
    network,
    consent,
  };
}

/**
 * Check one event against the taxonomy and the visitor's consent. Unknown
 * events and parameters are refused rather than dropped, so nothing outside
 * the table reaches the sink. Without analytics consent only essential
 * events pass, and they lose the session id.
 */
export function admitTelemetryEvent(input: TelemetryInput, now: Date): TelemetryVerdict {
  if (!isTelemetryEvent(input.event)) {
    return { ok: false, reason: 'unknown_event' };
  }
  const at = Date.parse(input.ts);
  if (
    !Number.isFinite(at) ||
    at < now.getTime() - MAX_AGE_MS ||
    at > now.getTime() + MAX_SKEW_MS
  ) {
    return { ok: false, reason: 'bad_time' };
  }
  const context = readContext(input.context);
  if (!context) {
    return { ok: false, reason: 'bad_context' };
  }
  const spec: TelemetryEventSpec = TELEMETRY_EVENTS[input.event];
  const params: Record<string, ParamValue> = {};
  for (const [key, value] of Object.entries(input.params ?? {})) {
    const kind = spec.params[key];
    if (!kind || !validParam(kind, value)) {
      return { ok: false, reason: 'bad_param' };
    }
    params[key] = value;
  }
  if (context.consent === 'essential') {
    if (!spec.essential) {
      return { ok: false, reason: 'not_consented' };
    }
    delete context.session_id;
  }
  return {
    ok: true,
    event: {
      event: input.event,
      ts: new Date(at).toISOString(),
      essential: spec.essential,
      context: { ...context, funnel_stage: funnelStageOf(context.screen) },
      params,
    },
  };
}

/**
 * A short, stable fingerprint of an error (FNV-1a, 32 bits, hex), so the
 * same fault groups together without sending its message or stack, which can
 * carry URLs and typed text.
 */
export function stackHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * A label (a province name, a filter value) as an id the taxonomy accepts:
 * accents dropped, lower case, runs of anything else as one `-`.
 */
export function telemetryId(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

/**
 * What changed between two filter sets, as T-Events `filter_applied` and
 * `filter_removed`: each value added or taken away, with the count of active
 * values after the change.
 */
export function filterChanges(
  previous: Readonly<Record<string, readonly string[]>>,
  next: Readonly<Record<string, readonly string[]>>,
): {
  applied: { name: string; value: string }[];
  removed: { name: string; value: string }[];
  activeCount: number;
} {
  const applied: { name: string; value: string }[] = [];
  const removed: { name: string; value: string }[] = [];
  const names = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const name of names) {
    const before = previous[name] ?? [];
    const after = next[name] ?? [];
    for (const value of after) {
      if (!before.includes(value)) applied.push({ name, value });
    }
    for (const value of before) {
      if (!after.includes(value)) removed.push({ name, value });
    }
  }
  const activeCount = Object.values(next).reduce((sum, values) => sum + values.length, 0);
  return { applied, removed, activeCount };
}

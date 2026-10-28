import { Logger } from '@nestjs/common';
import { isIP } from 'node:net';

import type { SinkEvent, TelemetryRecordOptions, TelemetrySink } from './telemetry-sink';

/** A fetch-compatible function, so a test can supply a fake. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** How a self-hosted Plausible CE instance receives the T-Events. */
export interface PlausibleSinkOptions {
  /** The full events endpoint, e.g. `https://analytics.example.com/api/event`. */
  endpoint: string;
  /** The site's domain as registered in Plausible; derived from `siteUrl` when omitted. */
  domain?: string;
  /** The public site URL used to build each event's `url`; defaults to `https://<domain>`. */
  siteUrl?: string;
  /** The User-Agent Plausible sees; a stable value, since the sink is server-side. */
  userAgent?: string;
  /** Per-request timeout in milliseconds; defaults to three seconds. */
  timeoutMs?: number;
  /** Test seam; defaults to the global `fetch`. */
  fetch?: FetchLike;
}

const DEFAULT_USER_AGENT = 'VeredaTelemetry/1.0';
const DEFAULT_TIMEOUT_MS = 3000;

/**
 * The path a T-Event is reported on. Plausible wants the page's URL, while the
 * taxonomy carries a screen id rather than a path (and a server event carries
 * no screen at all), so each surface reports a stable synthetic path: the
 * storefront `/en/Home`, the desk `/admin/A-Dashboard`, the API `/server`.
 */
export function plausibleEventPath(event: SinkEvent): string {
  const context = event.context;
  if (context.app === 'server') {
    return '/server';
  }
  if (context.app === 'admin') {
    return `/admin/${context.screen}`;
  }
  return `/${context.locale}/${context.screen}`;
}

/**
 * The name Plausible records. `page_view` is the taxonomy's screen view, but
 * Plausible keeps its own page metrics on the built-in `pageview` name, so it
 * is mapped; every other event keeps its taxonomy name.
 */
export function plausibleEventName(event: SinkEvent): string {
  return event.event === 'page_view' ? 'pageview' : event.event;
}

/**
 * The event's context and parameters as Plausible custom properties. The
 * session id stays out (it is the tab's, and Plausible counts visitors
 * itself); the HMAC user id is not sent either, so Plausible stores no second
 * identifier. A list parameter is comma-joined, Plausible's limit for a value.
 */
export function plausibleProps(
  event: SinkEvent,
): Record<string, string | number | boolean> {
  const raw: Record<string, unknown> = {
    ...event.context,
    essential: event.essential,
    ...event.params,
  };
  delete raw.session_id;

  const props: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      props[key] = value.join(',');
    } else if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      props[key] = value;
    }
  }
  return props;
}

/**
 * The Plausible CE sink (plan Q10): one `POST /api/event` per admitted event,
 * with plain `fetch` and no SDK. Plausible has no batch endpoint and answers
 * 202 even when its bot filter drops an event (`x-plausible-dropped: 1`), so
 * both are checked and logged. A failed send is never thrown: the T-Events
 * intake and a booking transition must not fail because analytics is down.
 */
export class PlausibleTelemetrySink implements TelemetrySink {
  private readonly logger = new Logger('TelemetrySink');
  private readonly endpoint: string;
  private readonly domain: string;
  private readonly siteUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: PlausibleSinkOptions) {
    const siteUrl =
      options.siteUrl || (options.domain ? `https://${options.domain}` : null);
    if (!siteUrl) {
      throw new Error('Plausible needs a domain or a site URL');
    }
    let host: string;
    try {
      host = new URL(siteUrl).hostname;
    } catch {
      throw new Error(`Plausible needs a valid site URL, got "${siteUrl}"`);
    }
    this.endpoint = options.endpoint;
    this.domain = options.domain ?? host;
    this.siteUrl = siteUrl.replace(/\/+$/, '');
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs =
      options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  }

  async record(
    events: readonly SinkEvent[],
    options: TelemetryRecordOptions = {},
  ): Promise<void> {
    if (events.length === 0) {
      return;
    }
    const clientIp = options.clientIp ?? null;
    const results = await Promise.allSettled(
      events.map((event) => this.send(event, clientIp)),
    );
    const failed = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failed.length > 0) {
      const reason = failed[0]?.reason;
      this.logger.warn(
        `${failed.length}/${events.length} Plausible event(s) not sent: ${
          reason instanceof Error ? reason.message : String(reason)
        }`,
      );
    }
    const dropped = results.filter(
      (result) => result.status === 'fulfilled' && result.value === 'dropped',
    );
    if (dropped.length > 0) {
      this.logger.warn(
        `${dropped.length}/${events.length} Plausible event(s) dropped by bot filtering (check X-Forwarded-For)`,
      );
    }
  }

  private async send(
    event: SinkEvent,
    clientIp: string | null,
  ): Promise<'sent' | 'dropped'> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': this.userAgent,
    };
    // Plausible counts a visitor by user agent and IP; a server-side sink must
    // forward the visitor's own IP or its bot filter drops the event. Server
    // events have none (the hosting decision covers that case).
    if (clientIp && isIP(clientIp)) {
      headers['X-Forwarded-For'] = clientIp;
    }
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: plausibleEventName(event),
        url: `${this.siteUrl}${plausibleEventPath(event)}`,
        domain: this.domain,
        props: plausibleProps(event),
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    // Consume the (empty) body so the connection is released.
    await response.arrayBuffer();
    if (!response.ok) {
      throw new Error(`Plausible answered ${response.status}`);
    }
    return response.headers.get('x-plausible-dropped') === '1' ? 'dropped' : 'sent';
  }
}

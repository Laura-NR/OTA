import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PlausibleTelemetrySink,
  type FetchLike,
  type PlausibleSinkOptions,
} from '../src/telemetry/plausible-sink';
import type { SinkEvent } from '../src/telemetry/telemetry-sink';
import { MockTelemetrySink } from '../src/telemetry/telemetry-sink';
import { createTelemetrySink } from '../src/telemetry/telemetry-sink-factory';

interface Call {
  url: string;
  init: RequestInit;
}

const calls: Call[] = [];

function fakeFetch(
  responder: (call: Call, index: number) => Response | Promise<Response> = () =>
    new Response('{}', { status: 202 }),
): FetchLike {
  return async (url, init) => {
    const call = { url, init };
    calls.push(call);
    return responder(call, calls.length - 1);
  };
}

function options(overrides: Partial<PlausibleSinkOptions> = {}): PlausibleSinkOptions {
  return {
    endpoint: 'http://plausible.local/api/event',
    domain: 'vereda.travel',
    fetch: fakeFetch(),
    ...overrides,
  };
}

function storefrontEvent(overrides: Partial<SinkEvent> = {}): SinkEvent {
  return {
    event: 'compare_viewed',
    ts: '2026-10-27T10:00:00.000Z',
    essential: false,
    context: {
      session_id: 's_0123456789abcdef',
      app: 'web',
      screen: 'Compare',
      locale: 'en',
      currency: 'EUR',
      device_type: 'phone',
      viewport: 'xs',
      network: '4g',
      consent: 'analytics',
      funnel_stage: 3,
    },
    params: { package_ids: ['trinidad-heritage-trail', 'havana-jazz'], count: 2 },
    userId: 'h_0123456789abcdef0123456789abcdef',
    receivedAt: '2026-10-27T10:00:01.000Z',
    ...overrides,
  };
}

function deskEvent(): SinkEvent {
  return storefrontEvent({
    event: 'document_generated',
    essential: true,
    context: {
      app: 'admin',
      screen: 'A-Booking',
      locale: 'en',
      currency: 'EUR',
      device_type: 'desktop',
      viewport: 'lg',
      network: '4g',
      consent: 'essential',
      role: 'ops_admin',
      funnel_stage: null,
    },
    params: { booking_code: 'DEMO0001', trigger: 'manual' },
    userId: null,
  });
}

function serverEvent(): SinkEvent {
  return storefrontEvent({
    event: 'booking_state_changed',
    essential: true,
    context: { app: 'server', consent: 'essential', funnel_stage: null },
    params: {
      booking_code: 'DEMO0001',
      from: 'PENDING_PAYMENT',
      to: 'CONFIRMED',
      actor: 'traveler',
      reason: 'payment_confirmed',
    },
    userId: null,
  });
}

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

function headersOf(call: Call): Headers {
  return new Headers(call.init.headers);
}

afterEach(() => {
  calls.length = 0;
  vi.restoreAllMocks();
});

describe('PlausibleTelemetrySink', () => {
  it('posts a custom event to the events endpoint with its URL, domain and props', async () => {
    const sink = new PlausibleTelemetrySink(options());

    await sink.record([storefrontEvent()], { clientIp: '203.0.113.7' });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.url).toBe('http://plausible.local/api/event');
    expect(call!.init.method).toBe('POST');
    expect(headersOf(call!).get('content-type')).toBe('application/json');
    expect(headersOf(call!).get('user-agent')).toBe('VeredaTelemetry/1.0');
    expect(headersOf(call!).get('x-forwarded-for')).toBe('203.0.113.7');

    expect(bodyOf(call!)).toEqual({
      name: 'compare_viewed',
      url: 'https://vereda.travel/en/Compare',
      domain: 'vereda.travel',
      props: {
        app: 'web',
        screen: 'Compare',
        locale: 'en',
        currency: 'EUR',
        device_type: 'phone',
        viewport: 'xs',
        network: '4g',
        consent: 'analytics',
        funnel_stage: 3,
        essential: false,
        package_ids: 'trinidad-heritage-trail,havana-jazz',
        count: 2,
      },
    });
  });

  it("records the taxonomy page_view as Plausible's built-in pageview", async () => {
    const sink = new PlausibleTelemetrySink(options());

    await sink.record([
      storefrontEvent({
        event: 'page_view',
        params: { referrer_host: 'example.test' },
      }),
    ]);

    expect(bodyOf(calls[0]!).name).toBe('pageview');
  });

  it('sends no session or user identifier, so Plausible keeps only its own visitor id', async () => {
    const sink = new PlausibleTelemetrySink(options());

    await sink.record([storefrontEvent()]);

    const props = bodyOf(calls[0]!).props as Record<string, unknown>;
    expect(props).not.toHaveProperty('session_id');
    expect(props).not.toHaveProperty('user_id');
    expect(JSON.stringify(calls[0]!.init)).not.toContain('s_0123456789abcdef');
    expect(JSON.stringify(calls[0]!.init)).not.toContain('h_0123456789');
  });

  it('reports the desk and server surfaces on their own paths', async () => {
    const sink = new PlausibleTelemetrySink(options());

    await sink.record([deskEvent(), serverEvent()]);

    expect(calls.map((call) => bodyOf(call).url)).toEqual([
      'https://vereda.travel/admin/A-Booking',
      'https://vereda.travel/server',
    ]);
    const deskProps = bodyOf(calls[0]!).props as Record<string, unknown>;
    expect(deskProps).toMatchObject({ role: 'ops_admin', essential: true });
    const serverProps = bodyOf(calls[1]!).props as Record<string, unknown>;
    expect(serverProps).toMatchObject({ app: 'server', essential: true });
    expect(serverProps).not.toHaveProperty('screen');
  });

  it('forwards an IP only when it is a valid address', async () => {
    const sink = new PlausibleTelemetrySink(options());

    await sink.record([storefrontEvent()], { clientIp: 'not-an-ip' });
    await sink.record([storefrontEvent()], { clientIp: null });

    expect(headersOf(calls[0]!).has('x-forwarded-for')).toBe(false);
    expect(headersOf(calls[1]!).has('x-forwarded-for')).toBe(false);
  });

  it('logs a failed or dropped send but never throws', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const sink = new PlausibleTelemetrySink(
      options({
        fetch: fakeFetch((_call, index) => {
          if (index === 0) {
            return new Response('', { status: 500 });
          }
          if (index === 1) {
            return new Response('{}', {
              status: 202,
              headers: { 'x-plausible-dropped': '1' },
            });
          }
          throw new Error('network down');
        }),
      }),
    );

    await expect(
      sink.record([storefrontEvent(), storefrontEvent(), storefrontEvent()]),
    ).resolves.toBeUndefined();

    expect(calls).toHaveLength(3);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('2/3 Plausible event(s) not sent'),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('1/3 Plausible event(s) dropped'),
    );
  });

  it('derives the domain from a site URL and drops a trailing slash', async () => {
    const sink = new PlausibleTelemetrySink(
      options({ domain: undefined, siteUrl: 'https://www.vereda.travel/' }),
    );

    await sink.record([storefrontEvent()]);

    expect(bodyOf(calls[0]!)).toMatchObject({
      url: 'https://www.vereda.travel/en/Compare',
      domain: 'www.vereda.travel',
    });
  });
});

describe('createTelemetrySink', () => {
  it('builds the Plausible sink when configured', () => {
    expect(createTelemetrySink('plausible', null, options())).toBeInstanceOf(
      PlausibleTelemetrySink,
    );
  });

  it('falls back to the mock when Plausible has no settings or a bad site URL', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    expect(createTelemetrySink('plausible', null, null)).toBeInstanceOf(
      MockTelemetrySink,
    );
    expect(
      createTelemetrySink(
        'plausible',
        null,
        options({ siteUrl: 'not a URL', domain: undefined }),
      ),
    ).toBeInstanceOf(MockTelemetrySink);
    expect(error).toHaveBeenCalledTimes(2);
  });

  it('keeps the mock for the default and an unknown setting', () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    expect(createTelemetrySink(undefined, null, null)).toBeInstanceOf(MockTelemetrySink);
    expect(createTelemetrySink('mock', null, null)).toBeInstanceOf(MockTelemetrySink);
    expect(createTelemetrySink('matomo', null, null)).toBeInstanceOf(MockTelemetrySink);
  });
});

import { describe, expect, it } from 'vitest';

import {
  TELEMETRY_EVENTS,
  admitTelemetryEvent,
  consentLevel,
  cookiePermissions,
  deviceTypeFor,
  filterChanges,
  needsCookieChoice,
  networkFor,
  parseCookieChoice,
  screenForPath,
  serializeCookieChoice,
  stackHash,
  telemetryId,
  viewportFor,
  type CookieChoice,
  type TelemetryInput,
} from '../src';

const VERSIONS = { analytics: 'cookies-analytics@2026-10-25', marketing: null };

const choice = (overrides: Partial<CookieChoice> = {}): CookieChoice => ({
  analytics: true,
  marketing: false,
  analyticsVersion: VERSIONS.analytics,
  marketingVersion: null,
  savedAt: new Date('2026-10-25T10:00:00Z'),
  ...overrides,
});

describe('cookie choice', () => {
  it('reads back what it wrote, decoded or not', () => {
    const value = serializeCookieChoice(choice());
    expect(parseCookieChoice(value)).toEqual(choice());
    expect(parseCookieChoice(decodeURIComponent(value))).toEqual(choice());
  });

  it('reads a missing or malformed cookie as no choice', () => {
    expect(parseCookieChoice(undefined)).toBeNull();
    expect(parseCookieChoice('')).toBeNull();
    expect(parseCookieChoice('a=yes&m=0&t=1')).toBeNull();
    expect(parseCookieChoice('a=1&m=0')).toBeNull();
    expect(parseCookieChoice('%E0%A4%A')).toBeNull();
  });

  it('asks only when the agency offers an optional purpose', () => {
    expect(needsCookieChoice(null, { analytics: null, marketing: null })).toBe(false);
    expect(needsCookieChoice(null, VERSIONS)).toBe(true);
    expect(needsCookieChoice(choice(), VERSIONS)).toBe(false);
  });

  it('asks again when the words change, for a grant or a refusal', () => {
    const newWords = { ...VERSIONS, analytics: 'cookies-analytics@2027-01-01' };
    expect(needsCookieChoice(choice(), newWords)).toBe(true);
    expect(needsCookieChoice(choice({ analytics: false }), newWords)).toBe(true);
    expect(
      needsCookieChoice(choice(), { ...VERSIONS, marketing: 'cookies-marketing@1' }),
    ).toBe(true);
  });

  it('allows a purpose only when granted for the words in force', () => {
    expect(cookiePermissions(null, VERSIONS)).toEqual({
      analytics: false,
      marketing: false,
    });
    expect(cookiePermissions(choice(), VERSIONS)).toEqual({
      analytics: true,
      marketing: false,
    });
    expect(
      cookiePermissions(choice(), { ...VERSIONS, analytics: 'cookies-analytics@2' }),
    ).toEqual({ analytics: false, marketing: false });
    expect(
      cookiePermissions(choice({ marketing: true, marketingVersion: 'm@1' }), {
        analytics: null,
        marketing: 'm@1',
      }),
    ).toEqual({ analytics: false, marketing: true });
  });

  it('sends analytics events only with analytics consent, marketing or not', () => {
    expect(consentLevel({ analytics: false, marketing: true })).toBe('essential');
    expect(consentLevel({ analytics: true, marketing: false })).toBe('analytics');
    expect(consentLevel({ analytics: true, marketing: true })).toBe('marketing');
  });
});

describe('screens and funnel stages', () => {
  const locales = ['es', 'en', 'fr'];

  it('maps storefront paths to the board screens, with or without the locale prefix', () => {
    expect(screenForPath('/', locales)).toBe('Home');
    expect(screenForPath('/en', locales)).toBe('Home');
    expect(screenForPath('/en/packages', locales)).toBe('Packages');
    expect(screenForPath('/packages/compare', locales)).toBe('Compare');
    expect(screenForPath('/fr/packages/trinidad-heritage-trail', locales)).toBe(
      'Package',
    );
    expect(screenForPath('/en/packages/trinidad-heritage-trail/book', locales)).toBe(
      'Booking',
    );
    expect(screenForPath('/en/checkout/wire/wire_abc', locales)).toBe('Payment');
    expect(screenForPath('/en/account/reservations/r1/confirmation', locales)).toBe(
      'Confirmation',
    );
    expect(screenForPath('/en/account/reservations/r1', locales)).toBe('Trip');
    expect(screenForPath('/en/legal/cookies', locales)).toBe('CookieSettings');
    expect(screenForPath('/en/legal/privacy', locales)).toBe('Legal');
  });

  it('treats a path no screen claims as the 404 page, not a locale', () => {
    expect(screenForPath('/en/nowhere/at/all', locales)).toBe('NotFound');
    expect(screenForPath('/de/packages', locales)).toBe('NotFound');
  });

  it('buckets the viewport by the DS 07 breakpoints', () => {
    expect([320, 479, 480, 767, 768, 1023, 1024, 1279, 1280].map(viewportFor)).toEqual([
      'xs',
      'xs',
      'sm',
      'sm',
      'md',
      'md',
      'lg',
      'lg',
      'xl',
    ]);
    expect([390, 768, 1024].map(deviceTypeFor)).toEqual(['phone', 'tablet', 'desktop']);
  });

  it('reduces the connection rating to the board values', () => {
    expect(networkFor(false, '4g')).toBe('offline');
    expect(networkFor(true, 'slow-2g')).toBe('2g');
    expect(networkFor(true, '3g')).toBe('3g');
    expect(networkFor(true, undefined)).toBe('unknown');
  });
});

describe('event admission', () => {
  const now = new Date('2026-10-25T12:00:00Z');
  const context = {
    session_id: 's_0123456789abcdef',
    app: 'web',
    screen: 'Package',
    locale: 'en',
    currency: 'EUR',
    device_type: 'desktop',
    viewport: 'xl',
    network: '4g',
    consent: 'analytics',
  };
  const input = (overrides: Partial<TelemetryInput> = {}): TelemetryInput => ({
    event: 'package_viewed',
    ts: '2026-10-25T11:59:00Z',
    context,
    params: {
      package_id: 'trinidad-heritage-trail',
      price_from: 1290.5,
      currency: 'EUR',
    },
    ...overrides,
  });

  it('admits a known event and stamps the screen funnel stage', () => {
    const verdict = admitTelemetryEvent(input(), now);
    expect(verdict).toEqual({
      ok: true,
      event: {
        event: 'package_viewed',
        ts: '2026-10-25T11:59:00.000Z',
        essential: false,
        context: { ...context, funnel_stage: 3 },
        params: {
          package_id: 'trinidad-heritage-trail',
          price_from: 1290.5,
          currency: 'EUR',
        },
      },
    });
  });

  it('refuses an event outside the taxonomy', () => {
    expect(admitTelemetryEvent(input({ event: 'mouse_hovered' }), now)).toEqual({
      ok: false,
      reason: 'unknown_event',
    });
    expect(admitTelemetryEvent(input({ event: 'toString' }), now)).toEqual({
      ok: false,
      reason: 'unknown_event',
    });
  });

  it('refuses a parameter the event does not declare, so nothing personal slips in', () => {
    expect(
      admitTelemetryEvent(input({ params: { email: 'jane@example.test' } }), now),
    ).toEqual({ ok: false, reason: 'bad_param' });
  });

  it('refuses free text where an id is expected', () => {
    for (const package_id of ['Jane Traveler', 'jane@example.test', '', 'x'.repeat(97)]) {
      expect(admitTelemetryEvent(input({ params: { package_id } }), now)).toEqual({
        ok: false,
        reason: 'bad_param',
      });
    }
  });

  it('checks counts, amounts, flags and enumerations by their kind', () => {
    const results = (event: string, params: Record<string, unknown>) =>
      admitTelemetryEvent(input({ event, params }), now).ok;
    expect(
      results('search_results_loaded', { results_count: 3, zero_results: false }),
    ).toBe(true);
    expect(results('search_results_loaded', { results_count: -1 })).toBe(false);
    expect(results('search_results_loaded', { results_count: 1.5 })).toBe(false);
    expect(results('search_results_loaded', { zero_results: 'no' })).toBe(false);
    expect(results('package_viewed', { price_from: 12.345 })).toBe(false);
    expect(results('package_viewed', { price_from: 0.1 + 0.2 })).toBe(true);
    expect(results('package_viewed', { price_from: 100.5 })).toBe(true);
    expect(results('nav_clicked', { to_screen: 'Packages', nav: 'bottom' })).toBe(true);
    expect(results('nav_clicked', { to_screen: 'Nowhere', nav: 'bottom' })).toBe(false);
    expect(results('compare_viewed', { package_ids: ['a', 'b'], count: 2 })).toBe(true);
    expect(results('compare_viewed', { package_ids: ['a b'] })).toBe(false);
    expect(results('page_view', { referrer_host: 'www.example.org', entry: true })).toBe(
      true,
    );
    expect(results('page_view', { referrer_host: 'https://x.test/?e=a@b' })).toBe(false);
    expect(results('page_view', { utm_campaign: 'spring_2027' })).toBe(true);
    expect(results('page_view', { utm_campaign: 'jane@example.test' })).toBe(false);
  });

  it('refuses a context it does not know, or a forged session id', () => {
    expect(
      admitTelemetryEvent(input({ context: { ...context, user_id: 'h_1' } }), now),
    ).toEqual({ ok: false, reason: 'bad_context' });
    expect(
      admitTelemetryEvent(input({ context: { ...context, session_id: 'jane' } }), now),
    ).toEqual({ ok: false, reason: 'bad_context' });
    expect(
      admitTelemetryEvent(input({ context: { ...context, viewport: '2xl' } }), now),
    ).toEqual({ ok: false, reason: 'bad_context' });
  });

  it('refuses events from more than a day ago or from the future', () => {
    expect(admitTelemetryEvent(input({ ts: '2026-10-24T11:00:00Z' }), now).ok).toBe(
      false,
    );
    expect(admitTelemetryEvent(input({ ts: '2026-10-25T12:10:00Z' }), now).ok).toBe(
      false,
    );
    expect(admitTelemetryEvent(input({ ts: 'yesterday' }), now).ok).toBe(false);
  });

  it('without analytics consent passes only essential events, without the session id', () => {
    const essentialContext = { ...context, consent: 'essential' };
    expect(admitTelemetryEvent(input({ context: essentialContext }), now)).toEqual({
      ok: false,
      reason: 'not_consented',
    });
    const verdict = admitTelemetryEvent(
      input({
        event: 'booking_submitted',
        context: { ...essentialContext, screen: 'Booking' },
        params: { booking_code: 'VX7K2M9Q', total: 2580, currency: 'EUR', travelers: 2 },
      }),
      now,
    );
    expect(verdict.ok && verdict.event.essential).toBe(true);
    expect(verdict.ok && verdict.event.context).not.toHaveProperty('session_id');
    expect(verdict.ok && verdict.event.context.funnel_stage).toBe(4);
  });

  it('marks the booking, payment, error and consent events essential (T-Events §03)', () => {
    const essential = Object.entries(TELEMETRY_EVENTS)
      .filter(([, spec]) => spec.essential)
      .map(([name]) => name);
    for (const name of essential) {
      expect(name).toMatch(/^(booking_|payment_|client_error$|consent_set$)/);
    }
    for (const name of Object.keys(TELEMETRY_EVENTS)) {
      if (/^(booking_|payment_)/.test(name)) {
        expect(essential).toContain(name);
      }
      expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });
});

describe('telemetry helpers', () => {
  it('fingerprints an error the same way every time, without the text', () => {
    expect(stackHash('TypeError: x is undefined')).toBe(
      stackHash('TypeError: x is undefined'),
    );
    expect(stackHash('a')).not.toBe(stackHash('b'));
    expect(stackHash('anything')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('turns a label into an id', () => {
    expect(telemetryId('Pinar del Río')).toBe('pinar-del-rio');
    expect(telemetryId('  La Habana ')).toBe('la-habana');
  });

  it('lists each filter value added and removed, with the active count after', () => {
    expect(
      filterChanges(
        { province: ['matanzas'], duration: ['short'] },
        { province: ['matanzas', 'pinar-del-rio'], duration: [] },
      ),
    ).toEqual({
      applied: [{ name: 'province', value: 'pinar-del-rio' }],
      removed: [{ name: 'duration', value: 'short' }],
      activeCount: 2,
    });
    expect(filterChanges({}, {})).toEqual({ applied: [], removed: [], activeCount: 0 });
  });
});

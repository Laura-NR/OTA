import { describe, expect, it } from 'vitest';

import type {
  SinkEvent,
  TelemetryRecordOptions,
  TelemetrySink,
} from '../src/telemetry/telemetry-sink';
import { TelemetryService } from '../src/telemetry/telemetry.service';

const now = new Date('2026-10-27T10:00:00.000Z');

const event = {
  event: 'package_viewed',
  ts: now.toISOString(),
  context: {
    app: 'web',
    screen: 'Package',
    locale: 'en',
    currency: 'EUR',
    device_type: 'phone',
    viewport: 'xs',
    network: '4g',
    consent: 'analytics',
    session_id: 's_0123456789abcdef',
  },
  params: { package_id: 'trinidad-heritage-trail', price_from: 1290 },
};

describe('TelemetryService', () => {
  it('passes the visitor IP to the sink without putting it on the event', async () => {
    let seen: {
      events: readonly SinkEvent[];
      options?: TelemetryRecordOptions;
    } | null = null;
    const sink: TelemetrySink = {
      record: async (events, options) => {
        seen = { events, options };
      },
    };
    const service = new TelemetryService(sink);

    const receipt = await service.ingest(
      { events: [event] },
      null,
      null,
      '203.0.113.7',
      now,
    );

    expect(receipt).toEqual({ accepted: 1, rejected: 0 });
    expect(seen).not.toBeNull();
    expect(seen!.options).toEqual({ clientIp: '203.0.113.7' });
    expect(JSON.stringify(seen!.events)).not.toContain('203.0.113.7');
  });
});

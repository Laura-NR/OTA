import { mayReachAnalyticsStore } from '@ota/domain';

import type { SinkEvent, TelemetryRecordOptions, TelemetrySink } from './telemetry-sink';

/**
 * Splits each batch by consent (plan Q10 H4): a consenting visitor's events
 * go to the analytics store, the rest (desk, server, and the essential events
 * of a visitor who refused analytics) stay on the first-party sink.
 */
export class ConsentRoutedTelemetrySink implements TelemetrySink {
  constructor(
    private readonly analytics: TelemetrySink,
    private readonly firstParty: TelemetrySink,
  ) {}

  async record(
    events: readonly SinkEvent[],
    options: TelemetryRecordOptions = {},
  ): Promise<void> {
    const shared = events.filter((event) => mayReachAnalyticsStore(event));
    const kept = events.filter((event) => !mayReachAnalyticsStore(event));
    await Promise.all([
      shared.length > 0 ? this.analytics.record(shared, options) : undefined,
      kept.length > 0 ? this.firstParty.record(kept, options) : undefined,
    ]);
  }
}

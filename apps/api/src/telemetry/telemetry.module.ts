import { Global, Module } from '@nestjs/common';

import { ServerTelemetry } from './server-telemetry';
import { createTelemetrySink } from './telemetry-sink-factory';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { TELEMETRY_SINK } from './telemetry.tokens';
import type { PlausibleSinkOptions } from './plausible-sink';

/**
 * The Plausible settings, when the deploy supplies an endpoint and a site.
 * A missing piece is left for the factory to report and fall back on.
 */
function plausibleOptions(): PlausibleSinkOptions | null {
  const endpoint = process.env.TELEMETRY_PLAUSIBLE_ENDPOINT;
  if (!endpoint) {
    return null;
  }
  const siteUrl = process.env.TELEMETRY_PLAUSIBLE_SITE_URL || undefined;
  const domain = process.env.TELEMETRY_PLAUSIBLE_DOMAIN || undefined;
  if (!domain && !siteUrl) {
    return null;
  }
  const timeout = Number(process.env.TELEMETRY_PLAUSIBLE_TIMEOUT_MS);
  return {
    endpoint,
    domain,
    siteUrl,
    userAgent: process.env.TELEMETRY_PLAUSIBLE_USER_AGENT || undefined,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : undefined,
  };
}

/**
 * T-Events (Phase 8 item 1). The sink is injected behind `TELEMETRY_SINK`:
 * `mock` by default, or the self-hosted Plausible CE adapter (plan Q10).
 * `TELEMETRY_SINK_FILE` makes the mock also write the events to a file, which
 * the e2e stack reads. Global so the services that change bookings and offers
 * can inject `ServerTelemetry` without importing this module.
 */
@Global()
@Module({
  controllers: [TelemetryController],
  providers: [
    TelemetryService,
    ServerTelemetry,
    {
      provide: TELEMETRY_SINK,
      useFactory: () =>
        createTelemetrySink(
          process.env.TELEMETRY_SINK,
          process.env.TELEMETRY_SINK_FILE || null,
          plausibleOptions(),
        ),
    },
  ],
  exports: [ServerTelemetry],
})
export class TelemetryModule {}

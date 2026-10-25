import { Global, Module } from '@nestjs/common';

import { ServerTelemetry } from './server-telemetry';
import { createTelemetrySink, type TelemetrySinkKind } from './telemetry-sink';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { TELEMETRY_SINK } from './telemetry.tokens';

/**
 * T-Events (Phase 8 item 1). The sink is injected behind `TELEMETRY_SINK`;
 * the mock is the default until the self-hosted analytics choice (plan Q10),
 * and `TELEMETRY_SINK_FILE` makes it also write the events to a file. Global
 * so the services that change bookings and offers can inject
 * `ServerTelemetry` without importing this module.
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
          (process.env.TELEMETRY_SINK as TelemetrySinkKind | undefined) ?? 'mock',
          process.env.TELEMETRY_SINK_FILE || null,
        ),
    },
  ],
  exports: [ServerTelemetry],
})
export class TelemetryModule {}

import { Module } from '@nestjs/common';

import { createTelemetrySink, type TelemetrySinkKind } from './telemetry-sink';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { TELEMETRY_SINK } from './telemetry.tokens';

/**
 * T-Events (Phase 8 item 1). The sink is injected behind `TELEMETRY_SINK`;
 * the mock is the default until the self-hosted analytics choice (plan Q10).
 */
@Module({
  controllers: [TelemetryController],
  providers: [
    TelemetryService,
    {
      provide: TELEMETRY_SINK,
      useFactory: () =>
        createTelemetrySink(
          (process.env.TELEMETRY_SINK as TelemetrySinkKind | undefined) ?? 'mock',
        ),
    },
  ],
})
export class TelemetryModule {}

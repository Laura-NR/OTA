import { Logger } from '@nestjs/common';

import { ConsentRoutedTelemetrySink } from './consent-routed-sink';
import { MockTelemetrySink, type TelemetrySink } from './telemetry-sink';
import { PlausibleTelemetrySink, type PlausibleSinkOptions } from './plausible-sink';

const logger = new Logger('TelemetrySink');

/**
 * The sink named by `TELEMETRY_SINK`: `mock` (the default, and the e2e's file
 * sink) or `plausible`, where a self-hosted Plausible CE instance receives
 * the consenting visitors' events and the mock (with its file) keeps the rest.
 * A misconfigured or unknown setting falls back to the mock rather than
 * taking the API down; analytics is never on the path of a booking.
 */
export function createTelemetrySink(
  kind: string | undefined,
  file: string | null = null,
  plausible: PlausibleSinkOptions | null = null,
): TelemetrySink {
  switch (kind) {
    case 'plausible':
      if (!plausible) {
        logger.error(
          'TELEMETRY_SINK=plausible needs TELEMETRY_PLAUSIBLE_ENDPOINT and TELEMETRY_PLAUSIBLE_DOMAIN (or _SITE_URL); using the mock sink',
        );
        return new MockTelemetrySink(file);
      }
      try {
        const analytics = new PlausibleTelemetrySink(plausible);
        return new ConsentRoutedTelemetrySink(analytics, new MockTelemetrySink(file));
      } catch (error) {
        logger.error(
          `Plausible sink not configured: ${
            error instanceof Error ? error.message : String(error)
          }; using the mock sink`,
        );
        return new MockTelemetrySink(file);
      }
    case 'mock':
    case undefined:
      return new MockTelemetrySink(file);
    default:
      logger.warn(`Unknown TELEMETRY_SINK "${kind}"; using the mock sink`);
      return new MockTelemetrySink(file);
  }
}

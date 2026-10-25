import { z } from 'zod';

/** Events per request: the shell flushes in small batches. */
export const TELEMETRY_BATCH_MAX = 20;

const value = z.union([
  z.string().max(256),
  z.number(),
  z.boolean(),
  z.array(z.string().max(96)).max(20),
]);

/**
 * One T-Events event as the storefront shell sends it. This only bounds the
 * shape and size; `admitTelemetryEvent` (@ota/domain) decides what the
 * taxonomy accepts.
 */
export const telemetryEventSchema = z.strictObject({
  event: z.string().max(64),
  ts: z.string().max(40),
  context: z.record(z.string().max(32), z.string().max(64)),
  params: z.record(z.string().max(40), value).optional(),
});

/** POST /telemetry/events. */
export const telemetryBatchSchema = z.strictObject({
  events: z.array(telemetryEventSchema).min(1).max(TELEMETRY_BATCH_MAX),
});

/** How many events of a batch the sink took; refused events are only counted. */
export interface TelemetryReceiptDto {
  accepted: number;
  rejected: number;
}

export type TelemetryEventRequest = z.infer<typeof telemetryEventSchema>;
export type TelemetryBatchRequest = z.infer<typeof telemetryBatchSchema>;

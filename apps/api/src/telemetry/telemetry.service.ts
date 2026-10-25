import { Inject, Injectable } from '@nestjs/common';
import { admitTelemetryEvent, type AdmittedEvent } from '@ota/domain';
import type { TelemetryBatchRequest, TelemetryReceiptDto } from '@ota/schemas';
import { createHmac } from 'node:crypto';

import type { TelemetrySink } from './telemetry-sink';
import { TELEMETRY_SINK } from './telemetry.tokens';

/**
 * The visitor's id as T-Events carries it: an HMAC of the user id keyed by
 * `AUTH_SECRET`, so the sink can count returning travelers without being
 * able to name one, and nobody without the secret can link the hash back.
 */
export function hashUserId(userId: string, secret: string): string {
  return `h_${createHmac('sha256', secret)
    .update(`telemetry-user:${userId}`)
    .digest('hex')
    .slice(0, 32)}`;
}

@Injectable()
export class TelemetryService {
  constructor(@Inject(TELEMETRY_SINK) private readonly sink: TelemetrySink) {}

  /**
   * Admit each event against the taxonomy and the visitor's consent, attach
   * the hashed user id to the analytics events of a signed-in visitor, and
   * hand the admitted ones to the sink. `role` is the live session's account
   * role, which desk events need and carry. Refused events are only counted.
   */
  async ingest(
    batch: TelemetryBatchRequest,
    userId: string | null,
    role: string | null = null,
    now: Date = new Date(),
  ): Promise<TelemetryReceiptDto> {
    const admitted: AdmittedEvent[] = [];
    for (const input of batch.events) {
      const verdict = admitTelemetryEvent(input, now, role);
      if (verdict.ok) {
        admitted.push(verdict.event);
      }
    }
    const secret = process.env.AUTH_SECRET;
    const receivedAt = now.toISOString();
    if (admitted.length > 0) {
      await this.sink.record(
        admitted.map((event) => ({
          ...event,
          userId:
            userId && secret && event.context.consent !== 'essential'
              ? hashUserId(userId, secret)
              : null,
          receivedAt,
        })),
      );
    }
    return { accepted: admitted.length, rejected: batch.events.length - admitted.length };
  }
}

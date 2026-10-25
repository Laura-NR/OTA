import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  serverTelemetryEvent,
  transitionActorFor,
  type ParamValue,
  type ServerTelemetryEventName,
  type TransitionReason,
} from '@ota/domain';

import type { TelemetrySink } from './telemetry-sink';
import { TELEMETRY_SINK } from './telemetry.tokens';

/** A booking's move, as `booking_state_changed` reports it. */
export interface StateChange {
  bookingCode: string;
  from: string;
  to: string;
  /** The account behind the request that caused it; null is the system. */
  actor: { role: string } | null;
  reason: TransitionReason;
}

/**
 * The T-Events the API records itself (the table's `server` surface): every
 * booking transition and the dispatch engine's offers. Sent after the change
 * is stored and never awaited, so a slow or failing sink can neither delay
 * nor undo it; a refused or lost event is only logged.
 */
@Injectable()
export class ServerTelemetry {
  private readonly logger = new Logger(ServerTelemetry.name);

  constructor(@Inject(TELEMETRY_SINK) private readonly sink: TelemetrySink) {}

  emit(
    event: ServerTelemetryEventName,
    params: Readonly<Record<string, ParamValue | undefined>>,
    now: Date = new Date(),
  ): void {
    const verdict = serverTelemetryEvent(event, params, now);
    if (!verdict.ok) {
      this.logger.warn(`Server event ${event} refused: ${verdict.reason}`);
      return;
    }
    this.sink
      .record([{ ...verdict.event, userId: null, receivedAt: now.toISOString() }])
      .catch((error: unknown) => {
        this.logger.warn(
          `Server event ${event} not recorded: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  stateChanged(change: StateChange): void {
    this.emit('booking_state_changed', {
      booking_code: change.bookingCode,
      from: change.from,
      to: change.to,
      actor: transitionActorFor(change.actor?.role),
      reason: change.reason,
    });
  }
}

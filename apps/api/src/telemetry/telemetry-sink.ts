import { Logger } from '@nestjs/common';
import type { AdmittedEvent } from '@ota/domain';

/** An admitted event as the sink stores it: the user id is a salted hash. */
export interface SinkEvent extends AdmittedEvent {
  /** `h_` plus hex; only for a signed-in visitor who allowed analytics. */
  userId: string | null;
  receivedAt: string;
}

/**
 * Where T-Events go. The real sink (self-hosted Matomo or Plausible) is an
 * open third-party decision (plan Q10); until then the mock keeps the latest
 * events in memory and logs one line per batch.
 */
export interface TelemetrySink {
  record(events: readonly SinkEvent[]): Promise<void>;
}

/** How many events the mock keeps; older ones fall off. */
export const MOCK_SINK_CAPACITY = 500;

export class MockTelemetrySink implements TelemetrySink {
  private readonly logger = new Logger('TelemetrySink');
  private readonly buffer: SinkEvent[] = [];

  async record(events: readonly SinkEvent[]): Promise<void> {
    this.buffer.push(...events);
    this.buffer.splice(0, Math.max(0, this.buffer.length - MOCK_SINK_CAPACITY));
    this.logger.log(
      `${events.length} event(s): ${events
        .map((event) => `${event.event}@${event.context.screen}`)
        .join(', ')}`,
    );
  }

  /** The kept events, oldest first (tests and local inspection). */
  recent(): readonly SinkEvent[] {
    return [...this.buffer];
  }
}

export type TelemetrySinkKind = 'mock';

export function createTelemetrySink(kind: TelemetrySinkKind = 'mock'): TelemetrySink {
  switch (kind) {
    case 'mock':
      return new MockTelemetrySink();
  }
}

import { Logger } from '@nestjs/common';
import type { AdmittedEvent } from '@ota/domain';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * An admitted event as the sink stores it: the user id is a salted hash. An
 * event the API recorded itself has none.
 */
export interface SinkEvent extends AdmittedEvent {
  /** `h_` plus hex; only for a signed-in visitor who allowed analytics. */
  userId: string | null;
  receivedAt: string;
}

/** What a sink may need from the request; never stored with the event. */
export interface TelemetryRecordOptions {
  /** The visitor's IP, for a sink that counts visitors; server events have none. */
  clientIp?: string | null;
}

/**
 * Where T-Events go. `mock` is the default (the e2e's file sink); `plausible`
 * is the self-hosted Plausible CE adapter. The mock keeps the latest events in
 * memory and logs one line per batch, and with a file path also appends each
 * event to that file as a JSON line (so an e2e run can read the events the API
 * recorded itself).
 */
export interface TelemetrySink {
  record(events: readonly SinkEvent[], options?: TelemetryRecordOptions): Promise<void>;
}

/** How many events the mock keeps; older ones fall off. */
export const MOCK_SINK_CAPACITY = 500;

export class MockTelemetrySink implements TelemetrySink {
  private readonly logger = new Logger('TelemetrySink');
  private readonly buffer: SinkEvent[] = [];
  /** Appends run one after another, so the file keeps the order of the batches. */
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly file: string | null = null) {}

  async record(
    events: readonly SinkEvent[],
    _options?: TelemetryRecordOptions,
  ): Promise<void> {
    this.buffer.push(...events);
    this.buffer.splice(0, Math.max(0, this.buffer.length - MOCK_SINK_CAPACITY));
    this.logger.log(
      `${events.length} event(s): ${events
        .map(
          (event) =>
            `${event.event}@${'screen' in event.context ? event.context.screen : event.context.app}`,
        )
        .join(', ')}`,
    );
    const file = this.file;
    if (file) {
      const lines = events.map((event) => `${JSON.stringify(event)}\n`).join('');
      // The file is an inspection aid: a failed append is logged, never
      // fails the batch, and does not stop the appends after it.
      this.writes = this.writes.then(async () => {
        try {
          await mkdir(dirname(file), { recursive: true });
          await appendFile(file, lines);
        } catch (error) {
          this.logger.warn(
            `Could not append to ${file}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });
      await this.writes;
    }
  }

  /** The kept events, oldest first (tests and local inspection). */
  recent(): readonly SinkEvent[] {
    return [...this.buffer];
  }
}

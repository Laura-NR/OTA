export const RETENTION_SCHEDULER = 'ota:retention-scheduler';

export type RetentionScanHandler = () => Promise<void>;

/**
 * Schedules the recurring GDPR retention scan (spec §3.5). Abstracted so tests
 * run without Redis; the BullMQ implementation is the production default.
 */
export interface RetentionScheduler {
  schedule(handler: RetentionScanHandler): Promise<void>;
  close(): Promise<void>;
}

/** Used in tests and when no queue backend is configured. */
export class NoopRetentionScheduler implements RetentionScheduler {
  async schedule(): Promise<void> {
    // no-op
  }

  async close(): Promise<void> {
    // no-op
  }
}

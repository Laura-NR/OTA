export type FxRateRefreshHandler = () => Promise<void>;

/**
 * Schedules the daily rate refresh (C5a). Abstracted so tests run without
 * Redis; the BullMQ implementation is the production default.
 */
export interface FxRateScheduler {
  schedule(handler: FxRateRefreshHandler): Promise<void>;
  close(): Promise<void>;
}

/** Used in tests and when no queue backend is configured. */
export class NoopFxRateScheduler implements FxRateScheduler {
  async schedule(): Promise<void> {
    // no-op
  }

  async close(): Promise<void> {
    // no-op
  }
}

export const REMINDER_SCHEDULER = 'ota:reminder-scheduler';
/** The payment-window scan (24 h and 2 h before the first payment is due). */
export const WINDOW_REMINDER_SCHEDULER = 'ota:window-reminder-scheduler';

export type ReminderScanHandler = () => Promise<void>;

/**
 * Schedules a recurring reminder scan (balance or payment window). Abstracted
 * so tests run without Redis; the BullMQ implementation is the production
 * default.
 */
export interface ReminderScheduler {
  schedule(handler: ReminderScanHandler): Promise<void>;
  close(): Promise<void>;
}

/** Used in tests and when no queue backend is configured. */
export class NoopReminderScheduler implements ReminderScheduler {
  async schedule(): Promise<void> {
    // no-op
  }

  async close(): Promise<void> {
    // no-op
  }
}

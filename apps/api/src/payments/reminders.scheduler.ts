export const REMINDER_SCHEDULER = 'ota:reminder-scheduler';

export type ReminderScanHandler = () => Promise<void>;

/**
 * Schedules the recurring balance-reminder scan. Abstracted so tests run
 * without Redis; the BullMQ implementation is the production default.
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

import { Queue, Worker } from 'bullmq';

import { parseRedisUrl } from '../common/redis';
import type { ReminderScanHandler, ReminderScheduler } from './reminders.scheduler';

const QUEUE_NAME = 'payment-reminders';
const SCAN_JOB = 'instalment-reminder-scan';
const SCAN_SCHEDULER_ID = 'instalment-reminder-scan';
/** Daily at 07:00 server time, after the retention and compliance scans. */
const DAILY_PATTERN = '0 7 * * *';

export interface BullmqReminderSchedulerOptions {
  queueName?: string;
  /** Overrides the daily cron with a fixed interval (used by tests). */
  repeatEveryMs?: number;
}

/**
 * BullMQ repeatable job that sends the 7, 3 and 1-day instalment reminders
 * (Phase 6). The worker runs in-process; a unique queue name lets tests avoid
 * racing the running API. Idempotency lives in the audit log, not the queue.
 */
export class BullmqReminderScheduler implements ReminderScheduler {
  private readonly queue: Queue;
  private readonly worker: Worker;
  private readonly repeat: { pattern: string } | { every: number };
  private handler?: ReminderScanHandler;

  constructor(redisUrl: string, options: BullmqReminderSchedulerOptions = {}) {
    const connection = parseRedisUrl(redisUrl);
    const queueName = options.queueName ?? QUEUE_NAME;
    this.repeat = options.repeatEveryMs
      ? { every: options.repeatEveryMs }
      : { pattern: DAILY_PATTERN };
    this.queue = new Queue(queueName, { connection });
    this.worker = new Worker(
      queueName,
      async () => {
        if (this.handler) {
          await this.handler();
        }
      },
      { connection },
    );
  }

  async schedule(handler: ReminderScanHandler): Promise<void> {
    this.handler = handler;
    await this.queue.upsertJobScheduler(SCAN_SCHEDULER_ID, this.repeat, {
      name: SCAN_JOB,
      data: {},
      opts: { removeOnComplete: true, removeOnFail: true },
    });
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}

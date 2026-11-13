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
  /** The repeatable job's id and name in its queue. */
  schedulerId?: string;
  /** Overrides the daily cron with a fixed interval (the window scan; tests). */
  repeatEveryMs?: number;
  /** Overrides the 07:00 cron (the traveler-notification scan runs at 08:00). */
  pattern?: string;
}

/**
 * BullMQ repeatable job for a reminder scan (Phase 6): by default the daily
 * 7, 3 and 1-day balance reminders; the payment-window scan runs on its own
 * queue every few minutes. The worker runs in-process; a unique queue name
 * lets tests avoid racing the running API. Idempotency lives in the audit
 * log, not the queue.
 */
export class BullmqReminderScheduler implements ReminderScheduler {
  private readonly queue: Queue;
  private readonly worker: Worker;
  private readonly repeat: { pattern: string } | { every: number };
  private readonly schedulerId: string;
  private handler?: ReminderScanHandler;

  constructor(redisUrl: string, options: BullmqReminderSchedulerOptions = {}) {
    const connection = parseRedisUrl(redisUrl);
    const queueName = options.queueName ?? QUEUE_NAME;
    this.schedulerId = options.schedulerId ?? SCAN_SCHEDULER_ID;
    this.repeat = options.repeatEveryMs
      ? { every: options.repeatEveryMs }
      : { pattern: options.pattern ?? DAILY_PATTERN };
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
    await this.queue.upsertJobScheduler(this.schedulerId, this.repeat, {
      name: this.schedulerId === SCAN_SCHEDULER_ID ? SCAN_JOB : this.schedulerId,
      data: {},
      opts: { removeOnComplete: true, removeOnFail: true },
    });
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}

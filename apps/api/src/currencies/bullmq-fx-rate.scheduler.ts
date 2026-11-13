import { Queue, Worker } from 'bullmq';

import { parseRedisUrl } from '../common/redis';
import type { FxRateRefreshHandler, FxRateScheduler } from './fx-rate.scheduler';

const QUEUE_NAME = 'fx-rates';
const REFRESH_JOB = 'fx-rate-refresh';
const REFRESH_SCHEDULER_ID = 'fx-rate-refresh';
/** Daily at 16:30 in Madrid, after the ECB publishes at about 16:00 CET. */
const DAILY_PATTERN = '30 16 * * *';
const DAILY_TZ = 'Europe/Madrid';

export interface BullmqFxRateSchedulerOptions {
  queueName?: string;
  /** Overrides the daily cron with a fixed interval (used by tests). */
  repeatEveryMs?: number;
}

/**
 * BullMQ repeatable job that stores the day's reference rates (C5a). The
 * worker runs in-process; a unique queue name lets tests avoid racing the
 * running API.
 */
export class BullmqFxRateScheduler implements FxRateScheduler {
  private readonly queue: Queue;
  private readonly worker: Worker;
  private readonly repeat: { pattern: string; tz: string } | { every: number };
  private handler?: FxRateRefreshHandler;

  constructor(redisUrl: string, options: BullmqFxRateSchedulerOptions = {}) {
    const connection = parseRedisUrl(redisUrl);
    const queueName = options.queueName ?? QUEUE_NAME;
    this.repeat = options.repeatEveryMs
      ? { every: options.repeatEveryMs }
      : { pattern: DAILY_PATTERN, tz: DAILY_TZ };
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

  async schedule(handler: FxRateRefreshHandler): Promise<void> {
    this.handler = handler;
    await this.queue.upsertJobScheduler(REFRESH_SCHEDULER_ID, this.repeat, {
      name: REFRESH_JOB,
      data: {},
      opts: { removeOnComplete: true, removeOnFail: true },
    });
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}

import { Queue, Worker } from 'bullmq';

import { parseRedisUrl } from '../common/redis';
import type { RetentionScheduler, RetentionScanHandler } from './retention.scheduler';

const QUEUE_NAME = 'retention-lifecycle';
const SCAN_JOB = 'retention-scan';
const SCAN_SCHEDULER_ID = 'retention-scan';
/** Daily at 05:00 server time, ahead of the 06:00 compliance scan. */
const DAILY_PATTERN = '0 5 * * *';

export interface BullmqRetentionSchedulerOptions {
  queueName?: string;
  /** Overrides the daily cron with a fixed interval (used by tests). */
  repeatEveryMs?: number;
}

/**
 * BullMQ repeatable job that runs the GDPR retention scan (spec §3.5): sends
 * the 6-month keep-alive notices and anonymizes records whose 30-day grace
 * period elapsed. The worker runs in-process; a unique queue name lets tests
 * avoid racing the running API.
 */
export class BullmqRetentionScheduler implements RetentionScheduler {
  private readonly queue: Queue;
  private readonly worker: Worker;
  private readonly repeat: { pattern: string } | { every: number };
  private handler?: RetentionScanHandler;

  constructor(redisUrl: string, options: BullmqRetentionSchedulerOptions = {}) {
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

  async schedule(handler: RetentionScanHandler): Promise<void> {
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

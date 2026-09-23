import { Queue, Worker } from 'bullmq';

import { parseRedisUrl } from '../common/redis';
import type { DigestHandler, ReportsScheduler } from './reports.scheduler';

const QUEUE_NAME = 'analytics-digest';
const DIGEST_JOB = 'weekly-digest';
const SCHEDULER_ID = 'weekly-digest';
/** Weekly, Monday at 07:00 server time. */
const WEEKLY_PATTERN = '0 7 * * 1';

export interface BullmqReportsSchedulerOptions {
  queueName?: string;
  /** Overrides the weekly cron with a fixed interval (used by tests). */
  repeatEveryMs?: number;
}

/**
 * BullMQ repeatable job that builds and emails the weekly BI digest. The worker
 * runs in-process; a unique queue name lets tests avoid racing the running API.
 */
export class BullmqReportsScheduler implements ReportsScheduler {
  private readonly queue: Queue;
  private readonly worker: Worker;
  private readonly repeat: { pattern: string } | { every: number };
  private handler?: DigestHandler;

  constructor(redisUrl: string, options: BullmqReportsSchedulerOptions = {}) {
    const connection = parseRedisUrl(redisUrl);
    const queueName = options.queueName ?? QUEUE_NAME;
    this.repeat = options.repeatEveryMs
      ? { every: options.repeatEveryMs }
      : { pattern: WEEKLY_PATTERN };
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

  async schedule(handler: DigestHandler): Promise<void> {
    this.handler = handler;
    await this.queue.upsertJobScheduler(SCHEDULER_ID, this.repeat, {
      name: DIGEST_JOB,
      data: {},
      opts: { removeOnComplete: true, removeOnFail: true },
    });
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}

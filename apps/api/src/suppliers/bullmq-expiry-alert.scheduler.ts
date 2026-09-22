import { Queue, Worker } from 'bullmq';

import { parseRedisUrl } from '../common/redis';
import type { ComplianceScheduler, ExpiryScanHandler } from './expiry-alert.scheduler';

const QUEUE_NAME = 'compliance-expiry';
const SCAN_JOB = 'expiry-scan';
const SCAN_SCHEDULER_ID = 'credential-expiry';
/** Daily at 06:00 server time. */
const DAILY_PATTERN = '0 6 * * *';

export interface BullmqComplianceSchedulerOptions {
  queueName?: string;
  /** Overrides the daily cron with a fixed interval (used by tests). */
  repeatEveryMs?: number;
}

/**
 * BullMQ repeatable job that runs the credential-expiry scan. The worker runs
 * in-process; a unique queue name lets tests avoid racing the running API.
 */
export class BullmqExpiryAlertScheduler implements ComplianceScheduler {
  private readonly queue: Queue;
  private readonly worker: Worker;
  private readonly repeat: { pattern: string } | { every: number };
  private handler?: ExpiryScanHandler;

  constructor(redisUrl: string, options: BullmqComplianceSchedulerOptions = {}) {
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

  async schedule(handler: ExpiryScanHandler): Promise<void> {
    this.handler = handler;
    await this.queue.upsertJobScheduler(SCAN_SCHEDULER_ID, this.repeat, {
      name: SCAN_JOB,
      data: {},
      opts: { removeOnComplete: true, removeOnFail: true },
    });
  }

  /** Removes the queue and its repeat schedule. Intended for tests. */
  async obliterate(): Promise<void> {
    await this.queue.obliterate({ force: true });
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}

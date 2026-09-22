import { Queue, Worker, type Job } from 'bullmq';

import type { DispatchScheduler, DispatchTimeoutHandler } from './dispatch.scheduler';

const QUEUE_NAME = 'dispatch';
const TIMEOUT_JOB = 'dispatch-timeout';

interface TimeoutJobData {
  serviceItemId: string;
}

function parseRedisUrl(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    // Required by BullMQ workers so blocking commands are not aborted.
    maxRetriesPerRequest: null as null,
  };
}

/**
 * BullMQ-backed scheduler. The worker runs in-process; a job fires the timeout
 * handler registered by the dispatch service. A job id of the service-item id
 * makes scheduling idempotent.
 */
export class BullmqDispatchScheduler implements DispatchScheduler {
  private readonly queue: Queue<TimeoutJobData>;
  private readonly worker: Worker<TimeoutJobData>;
  private handler?: DispatchTimeoutHandler;

  constructor(redisUrl: string, queueName: string = QUEUE_NAME) {
    const connection = parseRedisUrl(redisUrl);
    this.queue = new Queue<TimeoutJobData>(queueName, { connection });
    this.worker = new Worker<TimeoutJobData>(
      queueName,
      async (job: Job<TimeoutJobData>) => {
        if (this.handler) {
          await this.handler(job.data.serviceItemId);
        }
      },
      { connection },
    );
  }

  setTimeoutHandler(handler: DispatchTimeoutHandler): void {
    this.handler = handler;
  }

  async scheduleTimeout(serviceItemId: string, delayMs: number): Promise<void> {
    await this.queue.add(
      TIMEOUT_JOB,
      { serviceItemId },
      {
        delay: delayMs,
        jobId: serviceItemId,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async cancelTimeout(serviceItemId: string): Promise<void> {
    const job = await this.queue.getJob(serviceItemId);
    if (job) {
      await job.remove();
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}

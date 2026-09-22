import { describe, expect, it } from 'vitest';

import { BullmqDispatchScheduler } from '../src/dispatch/bullmq-dispatch.scheduler';

const redisUrl = process.env.REDIS_URL;

/**
 * Live proof that a delayed BullMQ job actually fires the dispatch timeout
 * handler (not just that it was scheduled). Skipped unless REDIS_URL is set, so
 * the default unit suite still runs without Redis.
 */
describe.skipIf(!redisUrl)('BullmqDispatchScheduler (live Redis)', () => {
  it('fires the timeout handler when the delayed job becomes due', async () => {
    const scheduler = new BullmqDispatchScheduler(
      redisUrl as string,
      `dispatch-test-${Date.now()}`,
    );

    const fired = new Promise<string>((resolve) => {
      scheduler.setTimeoutHandler(async (serviceItemId) => {
        resolve(serviceItemId);
      });
    });

    await scheduler.scheduleTimeout('svc-timeout-1', 150);

    const result = await Promise.race([
      fired,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('timeout job never fired')), 8000),
      ),
    ]);

    expect(result).toBe('svc-timeout-1');
    await scheduler.close();
  }, 15_000);
});

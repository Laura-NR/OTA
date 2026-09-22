import { describe, expect, it } from 'vitest';

import { BullmqExpiryAlertScheduler } from '../src/suppliers/bullmq-expiry-alert.scheduler';

const redisUrl = process.env.REDIS_URL;

/**
 * Live proof that the repeatable credential-expiry scan actually runs. Skipped
 * unless REDIS_URL is set; the unique queue name keeps it isolated from the
 * running API's scheduler.
 */
describe.skipIf(!redisUrl)('BullmqExpiryAlertScheduler (live Redis)', () => {
  it('runs the registered scan on the repeat schedule', async () => {
    const scheduler = new BullmqExpiryAlertScheduler(redisUrl as string, {
      queueName: `compliance-test-${Date.now()}`,
      repeatEveryMs: 300,
    });

    let resolveFirstRun!: () => void;
    const firstRun = new Promise<void>((resolve) => {
      resolveFirstRun = resolve;
    });
    let runs = 0;

    await scheduler.schedule(async () => {
      runs += 1;
      resolveFirstRun();
    });

    await Promise.race([
      firstRun,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('expiry scan never ran')), 8000),
      ),
    ]);

    expect(runs).toBeGreaterThan(0);
    await scheduler.obliterate();
    await scheduler.close();
  }, 15_000);
});

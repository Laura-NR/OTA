import { Redis } from 'ioredis';

import { parseRedisUrl } from '../common/redis';

export const REDIS_HEALTH = 'ota:redis-health';

/**
 * A quick liveness check against Redis. `enabled` is false when no queue backend
 * is configured (tests, local runs without Redis), so readiness reports the
 * check as skipped rather than failed.
 */
export interface RedisHealth {
  readonly enabled: boolean;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export class NoopRedisHealth implements RedisHealth {
  readonly enabled = false;

  async ping(): Promise<void> {
    // no-op
  }

  async close(): Promise<void> {
    // no-op
  }
}

export class IoredisHealth implements RedisHealth {
  readonly enabled = true;
  private readonly client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis({
      ...parseRedisUrl(redisUrl),
      lazyConnect: true,
      connectTimeout: 1500,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    // Readiness reports failures as a 503; keep the event stream from throwing.
    this.client.on('error', () => undefined);
  }

  async ping(): Promise<void> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
    await this.client.ping();
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}

export function createRedisHealth(env: NodeJS.ProcessEnv = process.env): RedisHealth {
  const redisUrl = env.REDIS_URL;
  if (env.NODE_ENV === 'test' || !redisUrl) {
    return new NoopRedisHealth();
  }
  return new IoredisHealth(redisUrl);
}

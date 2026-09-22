/**
 * BullMQ connection options parsed from a Redis URL. `maxRetriesPerRequest`
 * must be null so blocking commands are not aborted by ioredis.
 */
export function parseRedisUrl(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

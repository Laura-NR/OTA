import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { REDIS_HEALTH, type RedisHealth } from './redis-health';

export type CheckStatus = 'up' | 'down' | 'skipped';

export interface ReadinessCheck {
  status: CheckStatus;
}

export interface ReadinessResponse {
  status: 'ok' | 'unavailable';
  checks: {
    database: ReadinessCheck;
    redis: ReadinessCheck;
  };
}

/**
 * Readiness (unlike the liveness `/health`) verifies the API can serve traffic:
 * Postgres must answer, and Redis when a queue backend is configured. The body
 * carries no error details — a public probe should not leak internals; failures
 * are logged.
 */
@Injectable()
export class ReadinessService implements OnModuleDestroy {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_HEALTH) private readonly redis: RedisHealth,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.close();
  }

  async check(): Promise<ReadinessResponse> {
    const [database, redis] = await Promise.all([
      this.probeDatabase(),
      this.probeRedis(),
    ]);
    const ok = database.status === 'up' && redis.status !== 'down';

    return {
      status: ok ? 'ok' : 'unavailable',
      checks: { database, redis },
    };
  }

  private async probeDatabase(): Promise<ReadinessCheck> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up' };
    } catch (error) {
      this.logger.error(
        'Readiness: database check failed',
        error instanceof Error ? error.stack : undefined,
      );
      return { status: 'down' };
    }
  }

  private async probeRedis(): Promise<ReadinessCheck> {
    if (!this.redis.enabled) {
      return { status: 'skipped' };
    }
    try {
      await this.redis.ping();
      return { status: 'up' };
    } catch (error) {
      this.logger.error(
        'Readiness: redis check failed',
        error instanceof Error ? error.stack : undefined,
      );
      return { status: 'down' };
    }
  }
}

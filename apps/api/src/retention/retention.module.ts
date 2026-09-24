import { Module } from '@nestjs/common';

import { BullmqRetentionScheduler } from './bullmq-retention.scheduler';
import { RetentionController } from './retention.controller';
import { NoopRetentionScheduler, RETENTION_SCHEDULER } from './retention.scheduler';
import { RetentionService } from './retention.service';

/**
 * GDPR retention lifecycle (spec §3.5). The daily scheduler is a no-op in tests
 * or when Redis is not configured, matching the compliance/reports jobs.
 */
@Module({
  controllers: [RetentionController],
  providers: [
    RetentionService,
    {
      provide: RETENTION_SCHEDULER,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL;
        if (process.env.NODE_ENV === 'test' || !redisUrl) {
          return new NoopRetentionScheduler();
        }
        return new BullmqRetentionScheduler(redisUrl);
      },
    },
  ],
})
export class RetentionModule {}

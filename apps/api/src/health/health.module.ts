import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { ReadinessService } from './readiness.service';
import { createRedisHealth, REDIS_HEALTH } from './redis-health';

@Module({
  controllers: [HealthController],
  providers: [
    ReadinessService,
    { provide: REDIS_HEALTH, useFactory: () => createRedisHealth() },
  ],
})
export class HealthModule {}

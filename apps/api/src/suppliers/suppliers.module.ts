import { Module } from '@nestjs/common';

import { BullmqExpiryAlertScheduler } from './bullmq-expiry-alert.scheduler';
import { COMPLIANCE_SCHEDULER, NoopComplianceScheduler } from './expiry-alert.scheduler';
import { ExpiryAlertService } from './expiry-alert.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  controllers: [SuppliersController],
  providers: [
    SuppliersService,
    ExpiryAlertService,
    {
      provide: COMPLIANCE_SCHEDULER,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL;
        if (process.env.NODE_ENV === 'test' || !redisUrl) {
          return new NoopComplianceScheduler();
        }
        return new BullmqExpiryAlertScheduler(redisUrl);
      },
    },
  ],
})
export class SuppliersModule {}

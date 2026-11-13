import { Module } from '@nestjs/common';

import { EscalationModule } from '../escalation/escalation.module';
import { BullmqDispatchScheduler } from './bullmq-dispatch.scheduler';
import { DeskAlertsController } from './desk-alerts.controller';
import { DeskAlertsService } from './desk-alerts.service';
import { DispatchController } from './dispatch.controller';
import { DISPATCH_SCHEDULER, NoopDispatchScheduler } from './dispatch.scheduler';
import { DispatchService } from './dispatch.service';

@Module({
  imports: [EscalationModule],
  controllers: [DispatchController, DeskAlertsController],
  providers: [
    DispatchService,
    DeskAlertsService,
    {
      provide: DISPATCH_SCHEDULER,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL;
        if (process.env.NODE_ENV === 'test' || !redisUrl) {
          return new NoopDispatchScheduler();
        }
        return new BullmqDispatchScheduler(redisUrl);
      },
    },
  ],
})
export class DispatchModule {}

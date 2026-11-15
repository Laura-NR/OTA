import { Module } from '@nestjs/common';

import { EscalationModule } from '../escalation/escalation.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

/** W-Job (`docs/schema-w-job.md`): steps, emergency reports and the desk's brief. */
@Module({
  imports: [EscalationModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}

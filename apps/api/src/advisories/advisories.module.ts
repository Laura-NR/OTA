import { Module } from '@nestjs/common';

import { AdvisoriesController } from './advisories.controller';
import { AdvisoriesService } from './advisories.service';
import { MeAdvisoriesController } from './me-advisories.controller';

/** M7 travel advisories: the desk workflow, the public reads and E-Advisory. */
@Module({
  controllers: [AdvisoriesController, MeAdvisoriesController],
  providers: [AdvisoriesService],
  exports: [AdvisoriesService],
})
export class AdvisoriesModule {}

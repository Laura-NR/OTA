import { Module } from '@nestjs/common';

import { AdvisoriesModule } from '../advisories/advisories.module';
import { DisruptionsController } from './disruptions.controller';
import { DisruptionsService } from './disruptions.service';
import { MeDisruptionsController } from './me-disruptions.controller';

/** M8 disruption cases: the desk workflow, the traveler's choice and E-Options. */
@Module({
  imports: [AdvisoriesModule],
  controllers: [DisruptionsController, MeDisruptionsController],
  providers: [DisruptionsService],
})
export class DisruptionsModule {}

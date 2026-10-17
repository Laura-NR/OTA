import { Module } from '@nestjs/common';

import { MeProposalsController } from './me-proposals.controller';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';

/** M5 custom-trip requests and proposals (no provider dependency). */
@Module({
  controllers: [ProposalsController, MeProposalsController],
  providers: [ProposalsService],
  exports: [ProposalsService],
})
export class ProposalsModule {}

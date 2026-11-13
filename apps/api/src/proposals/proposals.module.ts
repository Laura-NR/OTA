import { Module } from '@nestjs/common';

import { DocumentsModule } from '../documents/documents.module';
import { MeProposalsController } from './me-proposals.controller';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';

/** M5 custom-trip requests and proposals; the D-Proposal PDF uses the document renderer. */
@Module({
  imports: [DocumentsModule],
  controllers: [ProposalsController, MeProposalsController],
  providers: [ProposalsService],
  exports: [ProposalsService],
})
export class ProposalsModule {}

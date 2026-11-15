import { Module } from '@nestjs/common';

import { WorkerAppController } from './worker-app.controller';
import { WorkerAppService } from './worker-app.service';

/** The worker app's downloads and updates outside the stores (ADR 0007, Phase 7). */
@Module({
  controllers: [WorkerAppController],
  providers: [WorkerAppService],
  exports: [WorkerAppService],
})
export class WorkerAppModule {}

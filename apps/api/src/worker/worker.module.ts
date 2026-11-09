import { Module } from '@nestjs/common';

import { WorkerCodesService } from './worker-codes.service';
import { WorkerController, WorkerSignInCodeController } from './worker.controller';
import { WorkerService } from './worker.service';

/** The worker app's sign-in codes and reads (ADR 0007, Phase 7). */
@Module({
  controllers: [WorkerController, WorkerSignInCodeController],
  providers: [WorkerService, WorkerCodesService],
  exports: [WorkerCodesService],
})
export class WorkerModule {}

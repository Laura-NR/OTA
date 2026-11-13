import { Module } from '@nestjs/common';

import { SuppliersModule } from '../suppliers/suppliers.module';
import { WorkerCodesService } from './worker-codes.service';
import { WorkerController, WorkerSignInCodeController } from './worker.controller';
import { WorkerService } from './worker.service';

/** The worker app's sign-in codes, reads and calendar (ADR 0007, Phase 7). */
@Module({
  imports: [SuppliersModule],
  controllers: [WorkerController, WorkerSignInCodeController],
  providers: [WorkerService, WorkerCodesService],
  exports: [WorkerCodesService],
})
export class WorkerModule {}

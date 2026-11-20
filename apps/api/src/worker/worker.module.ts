import { Module } from '@nestjs/common';

import { JobsModule } from '../jobs/jobs.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { WorkerMessagesModule } from '../worker-messages/worker-messages.module';
import { WorkerCodesService } from './worker-codes.service';
import { WorkerController, WorkerSignInCodeController } from './worker.controller';
import { WorkerService } from './worker.service';

/** The worker app's sign-in codes, reads and calendar (ADR 0007, Phase 7). */
@Module({
  imports: [SuppliersModule, JobsModule, WorkerMessagesModule],
  controllers: [WorkerController, WorkerSignInCodeController],
  providers: [WorkerService, WorkerCodesService],
  exports: [WorkerCodesService],
})
export class WorkerModule {}

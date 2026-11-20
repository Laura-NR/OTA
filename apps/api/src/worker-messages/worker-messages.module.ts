import { Module } from '@nestjs/common';

import { EscalationModule } from '../escalation/escalation.module';
import {
  BookingWorkerThreadsController,
  SupplierMessagesController,
  WorkerMessagesController,
} from './worker-messages.controller';
import { WorkerMessagesService } from './worker-messages.service';

/** Worker ↔ desk messages (`docs/schema-w-messages.md`). */
@Module({
  imports: [EscalationModule],
  controllers: [
    WorkerMessagesController,
    SupplierMessagesController,
    BookingWorkerThreadsController,
  ],
  providers: [WorkerMessagesService],
  exports: [WorkerMessagesService],
})
export class WorkerMessagesModule {}

import { Module } from '@nestjs/common';

import { WorkerMessagesModule } from '../worker-messages/worker-messages.module';
import { OpsLiteController } from './ops-lite.controller';
import { OpsLiteService } from './ops-lite.service';

@Module({
  imports: [WorkerMessagesModule],
  controllers: [OpsLiteController],
  providers: [OpsLiteService],
})
export class OpsLiteModule {}

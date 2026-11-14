import { Module } from '@nestjs/common';

import { OpsLiteController } from './ops-lite.controller';
import { OpsLiteService } from './ops-lite.service';

@Module({
  controllers: [OpsLiteController],
  providers: [OpsLiteService],
})
export class OpsLiteModule {}

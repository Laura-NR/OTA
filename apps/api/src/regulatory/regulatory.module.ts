import { Module } from '@nestjs/common';

import { RegulatoryController } from './regulatory.controller';
import { RegulatoryService } from './regulatory.service';

@Module({
  controllers: [RegulatoryController],
  providers: [RegulatoryService],
})
export class RegulatoryModule {}

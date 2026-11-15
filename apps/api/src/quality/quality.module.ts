import { Module } from '@nestjs/common';

import { EscalationModule } from '../escalation/escalation.module';
import { QualityController } from './quality.controller';
import { QualityService } from './quality.service';

@Module({
  imports: [EscalationModule],
  controllers: [QualityController],
  providers: [QualityService],
})
export class QualityModule {}

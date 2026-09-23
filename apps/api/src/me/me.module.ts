import { Module } from '@nestjs/common';

import { PaymentsModule } from '../payments/payments.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [PaymentsModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}

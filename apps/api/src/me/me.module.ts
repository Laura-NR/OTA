import { Module } from '@nestjs/common';

import { ComplianceModule } from '../compliance/compliance.module';
import { PaymentsModule } from '../payments/payments.module';
import { TravelersModule } from '../travelers/travelers.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { PackageBookingService } from './package-booking.service';

@Module({
  imports: [PaymentsModule, ComplianceModule, TravelersModule],
  controllers: [MeController],
  providers: [MeService, PackageBookingService],
})
export class MeModule {}

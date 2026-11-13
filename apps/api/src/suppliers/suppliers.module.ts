import { Module } from '@nestjs/common';

import { DocumentsModule } from '../documents/documents.module';
import { BullmqExpiryAlertScheduler } from './bullmq-expiry-alert.scheduler';
import { COMPLIANCE_SCHEDULER, NoopComplianceScheduler } from './expiry-alert.scheduler';
import { ExpiryAlertService } from './expiry-alert.service';
import { SupplierPayoutsService } from './supplier-payouts.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  // The payout receipt renders through the shared document renderer.
  imports: [DocumentsModule],
  controllers: [SuppliersController],
  providers: [
    SuppliersService,
    SupplierPayoutsService,
    ExpiryAlertService,
    {
      provide: COMPLIANCE_SCHEDULER,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL;
        if (process.env.NODE_ENV === 'test' || !redisUrl) {
          return new NoopComplianceScheduler();
        }
        return new BullmqExpiryAlertScheduler(redisUrl);
      },
    },
  ],
  // The worker app's fuel declaration writes through the desk's resources path,
  // and W-Earnings reads the same payouts.
  exports: [SuppliersService, SupplierPayoutsService],
})
export class SuppliersModule {}

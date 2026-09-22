import { Module } from '@nestjs/common';

import { SupplierApplicationsController } from './supplier-applications.controller';
import { SupplierApplicationsService } from './supplier-applications.service';

@Module({
  controllers: [SupplierApplicationsController],
  providers: [SupplierApplicationsService],
})
export class SupplierApplicationsModule {}

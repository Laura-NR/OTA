import { Global, Module } from '@nestjs/common';

import { AuditLogService } from './audit-log.service';
import { OperatingSettingsService } from './operating-settings.service';
import { SettingsController } from './settings.controller';

/** Global, so every module reads the thresholds in force (M9 D3). */
@Global()
@Module({
  controllers: [SettingsController],
  providers: [OperatingSettingsService, AuditLogService],
  exports: [OperatingSettingsService],
})
export class SettingsModule {}

import { Global, Module } from '@nestjs/common';
import { llmProviderName } from '@ota/ai';
import { heldOffFeatures, type FeatureFlag } from '@ota/domain';

import { AuditLogService } from './audit-log.service';
import { OperatingSettingsService } from './operating-settings.service';
import { SettingsController } from './settings.controller';
import { HELD_OFF_FEATURES } from './settings.tokens';

/** What this deployment holds off: AI in production on the mock provider (A4). */
export function heldOffByDeployment(env: NodeJS.ProcessEnv = process.env): FeatureFlag[] {
  return heldOffFeatures({
    production: env.NODE_ENV === 'production',
    aiProviderIsMock: llmProviderName(env.AI_PROVIDER) === 'mock',
  });
}

/** Global, so every module reads the thresholds in force (M9 D3). */
@Global()
@Module({
  controllers: [SettingsController],
  providers: [
    OperatingSettingsService,
    AuditLogService,
    { provide: HELD_OFF_FEATURES, useFactory: () => heldOffByDeployment() },
  ],
  exports: [OperatingSettingsService],
})
export class SettingsModule {}

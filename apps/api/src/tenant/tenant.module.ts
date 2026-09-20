import { Global, Module } from '@nestjs/common';
import { loadTenantConfig } from '@ota/config';

import { TenantController } from './tenant.controller';
import { resolveTenantConfigPath } from './tenant.path';
import { TENANT_CONFIG } from './tenant.tokens';

@Global()
@Module({
  controllers: [TenantController],
  providers: [
    {
      provide: TENANT_CONFIG,
      useFactory: () => loadTenantConfig(resolveTenantConfigPath()),
    },
  ],
  exports: [TENANT_CONFIG],
})
export class TenantModule {}

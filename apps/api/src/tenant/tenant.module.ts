import { Global, Module } from '@nestjs/common';
import { join } from 'node:path';
import { loadTenantConfig } from '@ota/config';

import { TenantController } from './tenant.controller';
import { TENANT_CONFIG } from './tenant.tokens';

const DEFAULT_TENANT_PATH = join(
  process.cwd(),
  '..',
  '..',
  'tenant',
  'agency.config.json',
);

@Global()
@Module({
  controllers: [TenantController],
  providers: [
    {
      provide: TENANT_CONFIG,
      useFactory: () =>
        loadTenantConfig(process.env.TENANT_CONFIG_PATH ?? DEFAULT_TENANT_PATH),
    },
  ],
  exports: [TENANT_CONFIG],
})
export class TenantModule {}

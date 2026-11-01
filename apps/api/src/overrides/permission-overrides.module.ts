import { Global, Module } from '@nestjs/common';

import { PermissionOverridesController } from './permission-overrides.controller';
import { PermissionOverridesService } from './permission-overrides.service';

/** Global, so the auth guard can look up an override on any route (O7). */
@Global()
@Module({
  controllers: [PermissionOverridesController],
  providers: [PermissionOverridesService],
  exports: [PermissionOverridesService],
})
export class PermissionOverridesModule {}

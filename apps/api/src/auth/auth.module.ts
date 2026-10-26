import { Global, Module } from '@nestjs/common';

import { AuthService } from './auth.service';
import { PasskeysController } from './passkeys.controller';
import { SessionPolicy } from './session-policy';

/**
 * Provides session resolution and the session policy to the whole
 * application. Global so any feature module (guards, gateways) can inject
 * `AuthService` and `SessionPolicy` without importing it.
 */
@Global()
@Module({
  controllers: [PasskeysController],
  providers: [AuthService, SessionPolicy],
  exports: [AuthService, SessionPolicy],
})
export class AuthModule {}

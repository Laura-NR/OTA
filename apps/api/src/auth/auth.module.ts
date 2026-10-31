import { Global, Module } from '@nestjs/common';

import { AuthService } from './auth.service';
import { DeskSessionController } from './desk-session.controller';
import { DeskSessionService } from './desk-session.service';
import { PasskeysController } from './passkeys.controller';
import { SessionPolicy } from './session-policy';

/**
 * Provides session resolution and the session policy to the whole
 * application. Global so any feature module (guards, gateways) can inject
 * `AuthService` and `SessionPolicy` without importing it.
 */
@Global()
@Module({
  controllers: [PasskeysController, DeskSessionController],
  providers: [AuthService, SessionPolicy, DeskSessionService],
  exports: [AuthService, SessionPolicy],
})
export class AuthModule {}

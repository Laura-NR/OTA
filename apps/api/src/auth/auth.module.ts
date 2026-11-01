import { Global, Module } from '@nestjs/common';

import { AuthService } from './auth.service';
import { DeskSessionController } from './desk-session.controller';
import { DeskSessionService } from './desk-session.service';
import { PasskeysController } from './passkeys.controller';
import { RecoveryCodesService } from './recovery-codes.service';
import { SessionPolicy } from './session-policy';
import { SignInDevicesService } from './sign-in-devices.service';

/**
 * Provides session resolution and the session policy to the whole
 * application. Global so any feature module (guards, gateways) can inject
 * `AuthService` and `SessionPolicy` without importing it.
 */
@Global()
@Module({
  controllers: [PasskeysController, DeskSessionController],
  providers: [
    AuthService,
    SessionPolicy,
    DeskSessionService,
    RecoveryCodesService,
    SignInDevicesService,
  ],
  exports: [AuthService, SessionPolicy, RecoveryCodesService, SignInDevicesService],
})
export class AuthModule {}

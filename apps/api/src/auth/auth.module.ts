import { Global, Module } from '@nestjs/common';

import { AuthService } from './auth.service';

/**
 * Provides session resolution to the whole application. Global so any feature
 * module (guards, gateways) can inject `AuthService` without importing it.
 */
@Global()
@Module({
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}

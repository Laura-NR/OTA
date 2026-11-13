import { Global, Module } from '@nestjs/common';

import { createSmsChannel } from './sms.channel';

export const SMS_CHANNEL = 'ota:sms-channel';

/**
 * Provides the SMS channel (ADR 0007; console in development). Global so any
 * feature module can text a phone without importing this module.
 */
@Global()
@Module({
  providers: [{ provide: SMS_CHANNEL, useFactory: () => createSmsChannel() }],
  exports: [SMS_CHANNEL],
})
export class SmsModule {}

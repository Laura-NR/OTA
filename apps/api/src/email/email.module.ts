import { Global, Module } from '@nestjs/common';
import { createMailer } from '@ota/email';

export const MAILER = 'ota:mailer';

/**
 * Provides the transactional mailer (SMTP via nodemailer, console fallback).
 * Global so any feature module can send email without importing this module.
 */
@Global()
@Module({
  providers: [{ provide: MAILER, useFactory: () => createMailer() }],
  exports: [MAILER],
})
export class EmailModule {}

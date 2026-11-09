import { Logger } from '@nestjs/common';
import { maskWorkerPhone } from '@ota/domain';

/** An SMS to one phone (ADR 0007: one GSM-7 segment, no accents). */
export interface SmsMessage {
  /** The number as `+<digits>` (`normalizeWorkerPhone`). */
  to: string;
  body: string;
}

/**
 * Server-to-phone SMS (ADR 0007). A real provider (LINK Mobility, Messente or
 * Bird) waits on the legal entity; until then development logs the message
 * and production sends nothing, so a sign-in code never lands in a log.
 */
export interface SmsChannel {
  /** Whether a message actually leaves for the phone. */
  readonly delivers: boolean;
  send(message: SmsMessage): Promise<void>;
}

/** Development: the whole message in the API log, as `ConsoleMailer` does for email. */
export class ConsoleSmsChannel implements SmsChannel {
  readonly delivers = false;
  private readonly logger = new Logger('ConsoleSms');

  async send(message: SmsMessage): Promise<void> {
    this.logger.log(`SMS to ${message.to}: ${message.body}`);
  }
}

/** Production with no provider: nothing is sent, and the body is never logged. */
export class NoSmsChannel implements SmsChannel {
  readonly delivers = false;
  private readonly logger = new Logger('Sms');

  async send(message: SmsMessage): Promise<void> {
    this.logger.warn(
      `No SMS provider: a message to ${maskWorkerPhone(message.to)} was not sent`,
    );
  }
}

/**
 * The channel `SMS_PROVIDER` names: `console`, or `none`. Unset, development
 * logs to the console and production sends nothing.
 */
export function createSmsChannel(env: NodeJS.ProcessEnv = process.env): SmsChannel {
  const provider = env.SMS_PROVIDER?.trim().toLowerCase();
  if (provider === 'console') return new ConsoleSmsChannel();
  if (provider === 'none') return new NoSmsChannel();
  if (provider) throw new Error(`Unknown SMS_PROVIDER: ${provider}`);
  return env.NODE_ENV === 'production' ? new NoSmsChannel() : new ConsoleSmsChannel();
}

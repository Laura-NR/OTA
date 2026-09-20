import { createTransport, type Transporter } from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

export interface SmtpOptions {
  host: string;
  port: number;
  user?: string;
  password?: string;
  from: string;
  secure?: boolean;
}

/** SMTP mailer (Mailpit in development, any SMTP relay in production). */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(
    private readonly options: SmtpOptions,
    transport?: Transporter,
  ) {
    this.transport =
      transport ??
      createTransport({
        host: options.host,
        port: options.port,
        secure: options.secure ?? false,
        auth: options.user ? { user: options.user, pass: options.password } : undefined,
      });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.options.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
}

/**
 * Fallback that logs instead of sending, so development works without SMTP.
 * Never use in production.
 */
export class ConsoleMailer implements Mailer {
  async send(message: EmailMessage): Promise<void> {
    console.log(`[email] to=${message.to} subject=${message.subject}`);
    console.log(message.text);
  }
}

export function createMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const host = env.SMTP_HOST;
  const from = env.MAIL_FROM;
  if (!host || !from) {
    return new ConsoleMailer();
  }
  return new SmtpMailer({
    host,
    port: Number(env.SMTP_PORT ?? 1025),
    user: env.SMTP_USER || undefined,
    password: env.SMTP_PASSWORD || undefined,
    from,
  });
}

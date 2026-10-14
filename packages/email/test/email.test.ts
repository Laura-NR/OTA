import type { Transporter } from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';

import {
  ConsoleMailer,
  SmtpMailer,
  contactMessageEmail,
  createMailer,
  magicLinkEmail,
  retentionNoticeEmail,
  type EmailBranding,
} from '../src';

const branding: EmailBranding = {
  agencyName: 'Authentic Cuba Expeditions',
  licenseNumber: 'MINTUR-TEST-1234',
  primaryColor: '#0f766e',
};

describe('magicLinkEmail', () => {
  it('renders the sign-in URL and license', () => {
    const email = magicLinkEmail({
      to: 'jane@example.test',
      url: 'https://app.example.test/api/auth/magic-link/verify?token=abc',
      branding,
    });

    expect(email.to).toBe('jane@example.test');
    expect(email.subject).toContain('Authentic Cuba Expeditions');
    expect(email.html).toContain('token=abc');
    expect(email.html).toContain('MINTUR-TEST-1234');
    expect(email.text).toContain('token=abc');
  });
});

describe('retentionNoticeEmail', () => {
  it('renders the keep-alive link, deadline, and license', () => {
    const email = retentionNoticeEmail({
      to: 'jane@example.test',
      keepAliveUrl: 'https://app.example.test/retention/keep-alive?token=abc',
      purgeAt: new Date('2026-08-09T00:00:00Z'),
      branding,
    });

    expect(email.to).toBe('jane@example.test');
    expect(email.subject).toContain('Authentic Cuba Expeditions');
    expect(email.html).toContain('token=abc');
    expect(email.html).toContain('2026-08-09');
    expect(email.html).toContain('Keep My Account Active');
    expect(email.text).toContain('token=abc');
  });
});

describe('contactMessageEmail', () => {
  it('goes to the agency inbox, replies to the writer, and escapes their text', () => {
    const email = contactMessageEmail({
      to: 'desk@example.test',
      name: 'Jane <b>',
      email: 'jane@example.test',
      topic: 'My booking',
      bookingCode: 'E2E0001',
      replyLocale: 'en',
      message: 'Hello\n<script>x</script>',
      branding,
    });

    expect(email.to).toBe('desk@example.test');
    expect(email.replyTo).toBe('jane@example.test');
    expect(email.subject).toBe('Support form · My booking · Jane <b> · E2E0001');
    expect(email.html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(email.html).not.toContain('<script>');
    expect(email.text).toContain('Booking: E2E0001');
  });
});

describe('SmtpMailer', () => {
  it('sends through the transport with the configured from address', async () => {
    const sendMail = vi.fn(async () => ({}));
    const mailer = new SmtpMailer(
      { host: 'localhost', port: 1025, from: 'no-reply@example.test' },
      { sendMail } as unknown as Transporter,
    );

    await mailer.send({
      to: 'jane@example.test',
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'no-reply@example.test', to: 'jane@example.test' }),
    );
  });
});

describe('createMailer', () => {
  it('falls back to the console mailer without SMTP configuration', () => {
    expect(createMailer({})).toBeInstanceOf(ConsoleMailer);
  });

  it('builds an SMTP mailer when configured', () => {
    expect(
      createMailer({ SMTP_HOST: 'localhost', MAIL_FROM: 'no-reply@example.test' }),
    ).toBeInstanceOf(SmtpMailer);
  });
});

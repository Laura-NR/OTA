import type { Transporter } from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';

import {
  ConsoleMailer,
  SmtpMailer,
  bookingReceivedEmail,
  contactMessageEmail,
  createMailer,
  instalmentReminderEmail,
  magicLinkEmail,
  ofacReminderEmail,
  proposalSentEmail,
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

describe('bookingReceivedEmail', () => {
  it('carries the booking code, the dates and the amount in the traveler locale', () => {
    const email = bookingReceivedEmail({
      to: 'jane@example.test',
      name: 'Jane',
      bookingCode: 'VX-7K2M9Q',
      packageName: 'Viñales Eco Trail',
      startDate: new Date('2027-02-13T00:00:00Z'),
      endDate: new Date('2027-02-20T00:00:00Z'),
      total: 3100,
      currency: 'EUR',
      portalUrl: 'https://example.test/es/account/reservations/abc',
      locale: 'es',
      branding,
    });

    expect(email.subject).toContain('VX-7K2M9Q');
    expect(email.subject).toContain('aún no se ha cobrado nada');
    expect(email.html).toContain('Viñales Eco Trail');
    expect(email.html).toContain('13 de febrero de 2027');
    expect(email.html).toContain('MINTUR-TEST-1234');
    expect(email.text).toContain('https://example.test/es/account/reservations/abc');
  });
});

describe('ofacReminderEmail', () => {
  it('names the missing travelers, escapes them and links to the account', () => {
    const email = ofacReminderEmail({
      to: 'jane@example.test',
      name: 'Jane',
      bookingCode: 'VX-2F9HQ3',
      startDate: new Date('2027-02-08T00:00:00Z'),
      travelers: ['Luis <b>', 'Ana María'],
      portalUrl: 'https://example.test/en/account/reservations/abc',
      locale: 'en',
      branding,
    });

    expect(email.subject).toContain('VX-2F9HQ3');
    expect(email.html).toContain('Luis &lt;b&gt;');
    expect(email.html).not.toContain('Luis <b>');
    expect(email.html).toContain('Ana María');
    expect(email.html).toContain('February 8, 2027');
    expect(email.text).toContain('https://example.test/en/account/reservations/abc');
  });
});

describe('instalmentReminderEmail', () => {
  it('states the amount, due date and days left for the balance', () => {
    const email = instalmentReminderEmail({
      to: 'jane@example.test',
      name: 'Jane',
      bookingCode: 'VX-7K2M9Q',
      kind: 'BALANCE',
      amount: 2480,
      currency: 'EUR',
      dueAt: new Date('2027-01-14T00:00:00Z'),
      daysUntil: 7,
      portalUrl: 'https://example.test/es/account/reservations/abc',
      locale: 'es',
      branding,
    });

    expect(email.subject).toContain('Quedan 7 días');
    expect(email.subject).toContain('saldo');
    expect(email.html).toContain('14 de enero de 2027');
    expect(email.html).toContain('2480,00');
    expect(email.text).toContain('VX-7K2M9Q');
  });
});

describe('proposalSentEmail', () => {
  it('carries the reference, summary, total, validity and account link', () => {
    const email = proposalSentEmail({
      to: 'jane@example.test',
      name: 'Jane',
      reference: 'VX-C-4R8T',
      summary: 'Fourteen days west to Trinidad.',
      total: 5900,
      currency: 'EUR',
      validUntil: new Date('2026-10-21T23:59:59Z'),
      portalUrl: 'https://example.test/es/account/proposals/abc',
      locale: 'es',
      branding,
    });

    expect(email.subject).toContain('VX-C-4R8T');
    expect(email.html).toContain('Fourteen days west to Trinidad.');
    expect(email.html).toContain('5900,00');
    expect(email.html).toContain('21 de octubre de 2026');
    expect(email.text).toContain('https://example.test/es/account/proposals/abc');
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

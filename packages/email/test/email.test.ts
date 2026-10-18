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
  bookingConfirmedEmail,
  bookingSecuredEmail,
  paymentWindowReminderEmail,
  proposalSentEmail,
  retentionNoticeEmail,
  reviewRequestEmail,
  disruptionOptionsEmail,
  travelAdvisoryEmail,
  tripReconfirmEmail,
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
    expect(email.subject).toContain('August 9, 2026');
    expect(email.html).toContain('token=abc');
    expect(email.html).toContain('Keep my account active');
    expect(email.html).toContain('MINTUR-TEST-1234');
    expect(email.text).toContain('token=abc');
  });

  it("names what is removed and kept, in the traveler's locale, and marks the reminder", () => {
    const notice = retentionNoticeEmail({
      to: 'jane@example.test',
      name: 'Jane',
      keepAliveUrl: 'https://app.example.test/retention/keep-alive?token=abc',
      purgeAt: new Date('2027-04-20T00:00:00Z'),
      branding,
      locale: 'es',
    });
    expect(notice.subject).toBe(
      'Tu cuenta de Authentic Cuba Expeditions: consérvala o la anonimizaremos el 20 de abril de 2027',
    );
    expect(notice.text).toContain('Hola Jane:');
    expect(notice.text).toContain('datos de pasaporte');
    expect(notice.text).toContain('Conservar mi cuenta');

    const reminder = retentionNoticeEmail({
      to: 'jane@example.test',
      keepAliveUrl: 'https://app.example.test/retention/keep-alive?token=abc',
      purgeAt: new Date('2027-04-20T00:00:00Z'),
      branding,
      reminder: true,
    });
    expect(reminder.subject).toMatch(/^Reminder: /);
    expect(reminder.text).toContain('Hello,');
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
    expect(email.attachments).toBeUndefined();
    expect(email.html).not.toContain('PDF');
  });

  it('attaches the D-Proposal PDF and says so when one was rendered', () => {
    const pdf = {
      filename: 'VX-C-4R8T-v1.pdf',
      content: Buffer.from('%PDF-1.7'),
      contentType: 'application/pdf',
    };
    const email = proposalSentEmail({
      to: 'jane@example.test',
      name: 'Jane',
      reference: 'VX-C-4R8T',
      summary: 'Fourteen days west to Trinidad.',
      total: 5900,
      currency: 'EUR',
      validUntil: new Date('2026-10-21T23:59:59Z'),
      portalUrl: 'https://example.test/account/proposals/abc',
      locale: 'en',
      branding,
      pdf,
    });

    expect(email.attachments).toEqual([pdf]);
    expect(email.html).toContain('The proposal is attached as a PDF to keep or print.');
    expect(email.text).toContain('The proposal is attached as a PDF to keep or print.');
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

describe('paymentWindowReminderEmail (E-Reminder)', () => {
  it('gives the hours left, the amount and the UTC deadline, without promising a release', () => {
    const email = paymentWindowReminderEmail({
      to: 'jane@example.test',
      name: 'Jane',
      bookingCode: 'ABC12345',
      kind: 'DEPOSIT',
      amount: 620,
      currency: 'EUR',
      dueAt: new Date('2026-10-14T18:35:00Z'),
      hoursLeft: 2,
      portalUrl: 'https://example.test/account/reservations/r1',
      locale: 'en',
      branding,
    });
    expect(email.subject).toBe('2 hours left to pay your deposit · ABC12345');
    expect(email.text).toContain('€620.00');
    expect(email.text).toContain('October 14, 2026 at 06:35 PM UTC');
    expect(email.text).toContain('https://example.test/account/reservations/r1');
    expect(email.text).not.toMatch(/released/i);

    const fr = paymentWindowReminderEmail({
      to: 'jane@example.test',
      name: 'Jane',
      bookingCode: 'ABC12345',
      kind: 'FULL',
      amount: 1000,
      currency: 'EUR',
      dueAt: new Date('2026-10-14T18:35:00Z'),
      hoursLeft: 24,
      portalUrl: 'https://example.test/fr/account/reservations/r1',
      locale: 'fr',
      branding,
    });
    expect(fr.subject).toBe('Plus que 24 heures pour payer votre paiement · ABC12345');
  });
});

describe('bookingSecuredEmail (E-Invoice)', () => {
  it('offers the deposit or the full amount and the window that starts with the choice', () => {
    const email = bookingSecuredEmail({
      to: 'jane@example.test',
      name: 'Jane',
      bookingCode: 'ABC12345',
      tripName: 'Eco-Tourism in Viñales',
      startDate: new Date('2027-02-13T00:00:00Z'),
      endDate: new Date('2027-02-20T00:00:00Z'),
      total: 3100,
      currency: 'EUR',
      deposit: {
        amount: 620,
        percent: 20,
        balance: 2480,
        balanceDueAt: new Date('2026-12-15T00:00:00Z'),
      },
      windowHours: 48,
      portalUrl: 'https://example.test/account/reservations/r1',
      locale: 'en',
      branding,
    });
    expect(email.subject).toBe('Your trip is secured · choose how to pay · ABC12345');
    expect(email.text).toContain('Eco-Tourism in Viñales, February 13 – 20, 2027');
    expect(email.text).toContain(
      '- a 20 % deposit of €620.00 now, and the balance of €2,480.00 by December 15, 2026;',
    );
    expect(email.text).toContain('- or the full €3,100.00 now.');
    expect(email.text).toContain('you have 48 hours to pay');
    expect(email.html.indexOf('48 hours')).toBeLessThan(
      email.html.indexOf('Choose and pay'),
    );
    expect(email.attachments).toBeUndefined();

    const full = bookingSecuredEmail({
      to: 'jane@example.test',
      name: 'Jane',
      bookingCode: 'ABC12345',
      tripName: null,
      startDate: new Date('2027-02-13T00:00:00Z'),
      endDate: new Date('2027-02-20T00:00:00Z'),
      total: 900,
      currency: 'EUR',
      deposit: null,
      windowHours: 48,
      portalUrl: 'https://example.test/es/account/reservations/r1',
      locale: 'es',
      branding,
    });
    expect(full.text).toContain('Tu viaje a medida');
    expect(full.text).toContain('- el importe completo de 900,00 €.');
  });
});

describe('bookingConfirmedEmail (E-Confirmed)', () => {
  const voucher = {
    filename: 'voucher-ABC12345.pdf',
    content: Buffer.from('%PDF-1.7'),
    contentType: 'application/pdf',
  };

  it('acknowledges the payment, attaches the documents and links the confirmation', () => {
    const email = bookingConfirmedEmail({
      to: 'jane@example.test',
      name: 'Jane',
      bookingCode: 'ABC12345',
      tripName: 'Eco-Tourism in Viñales',
      startDate: new Date('2027-02-13T00:00:00Z'),
      endDate: new Date('2027-02-20T00:00:00Z'),
      currency: 'EUR',
      paid: { kind: 'DEPOSIT', amount: 620 },
      next: { kind: 'BALANCE', amount: 2480, dueAt: new Date('2026-12-15T00:00:00Z') },
      voucherHeld: false,
      attachments: [voucher],
      confirmationUrl: 'https://example.test/account/reservations/r1/confirmation',
      locale: 'en',
      branding,
    });
    expect(email.subject).toBe(
      'Confirmed: Eco-Tourism in Viñales, February 13 – 20, 2027 · ABC12345',
    );
    expect(email.text).toContain('We received your deposit of €620.00.');
    expect(email.text).toContain('Your voucher and invoice are attached.');
    expect(email.text).toContain('the balance of €2,480.00 by December 15, 2026');
    expect(email.text).toContain(
      'Open your confirmation: https://example.test/account/reservations/r1/confirmation',
    );
    expect(email.attachments).toEqual([voucher]);
  });

  it('says the voucher waits for the US certification and when it is paid in full', () => {
    const email = bookingConfirmedEmail({
      to: 'jane@example.test',
      name: 'Jane',
      bookingCode: 'ABC12345',
      tripName: null,
      startDate: new Date('2027-02-13T00:00:00Z'),
      endDate: new Date('2027-02-20T00:00:00Z'),
      currency: 'EUR',
      paid: { kind: 'FULL', amount: 900 },
      next: null,
      voucherHeld: true,
      attachments: [],
      confirmationUrl: 'https://example.test/account/reservations/r1/confirmation',
      locale: 'en',
      branding,
    });
    expect(email.text).toContain(
      'The voucher follows once every US traveler has certified',
    );
    expect(email.text).toContain('Your trip is paid in full.');
    expect(email.attachments).toBeUndefined();
  });
});

describe('reviewRequestEmail (E-NPS, adapted)', () => {
  it('asks for the trip rating once, and says the reminder is the last', () => {
    const first = reviewRequestEmail({
      to: 'jane@example.test',
      name: 'Jane',
      bookingCode: 'ABC12345',
      tripName: 'Eco-Tourism in Viñales',
      reminder: false,
      portalUrl: 'https://example.test/account/reservations/r1',
      locale: 'en',
      branding,
    });
    expect(first.subject).toBe('How was Eco-Tourism in Viñales? · ABC12345');
    expect(first.text).toContain('Rate it from 1 to 5');
    expect(first.text).not.toContain('only reminder');

    const reminder = reviewRequestEmail({
      to: 'jane@example.test',
      name: 'Jane',
      bookingCode: 'ABC12345',
      tripName: null,
      reminder: true,
      portalUrl: 'https://example.test/account/reservations/r1',
      locale: 'fr',
      branding,
    });
    expect(reminder.subject).toBe('Une minute pour votre voyage ? · ABC12345');
    expect(reminder.text).toContain("C'est le seul rappel que nous envoyons.");
  });
});

describe('tripReconfirmEmail (E-Reconfirm, reduced)', () => {
  it('gives the first meeting, asks for the flight, the balance and attaches the voucher', () => {
    const voucher = {
      filename: 'voucher-ABC12345.pdf',
      content: Buffer.from('%PDF-1.7'),
      contentType: 'application/pdf',
    };
    const email = tripReconfirmEmail({
      to: 'jane@example.test',
      name: 'Jane',
      bookingCode: 'ABC12345',
      tripName: 'Eco-Tourism in Viñales',
      startDate: new Date('2027-02-13T00:00:00Z'),
      endDate: new Date('2027-02-20T00:00:00Z'),
      firstMeeting: {
        province: 'Pinar del Río',
        startsAt: new Date('2027-02-13T15:00:00Z'),
      },
      balance: { amount: 2480, currency: 'EUR', dueAt: new Date('2027-01-14T00:00:00Z') },
      voucher,
      portalUrl: 'https://example.test/account/reservations/r1',
      travelInfoUrl: 'https://example.test/travel-info',
      locale: 'en',
      branding,
    });
    expect(email.subject).toBe('One week to go · Eco-Tourism in Viñales · ABC12345');
    expect(email.text).toContain(
      '- Your first service starts in Pinar del Río on February 13, 2027 at 03:00 PM UTC.',
    );
    expect(email.text).toContain('arrival flight');
    expect(email.text).toContain(
      '- Your balance of €2,480.00 is due by January 14, 2027.',
    );
    expect(email.text).toContain('https://example.test/travel-info');
    expect(email.attachments).toEqual([voucher]);
  });
});

describe('travelAdvisoryEmail (E-Advisory)', () => {
  const input = {
    to: 'jane@example.test',
    name: 'Jane',
    severity: 'CAUTION' as const,
    headline: 'Fuel queues in Pinar del Río, 6 Oct.',
    body: 'Station queues of 2 h or more around Viñales.',
    cta: 'See current conditions',
    source: 'Vereda drivers on the ground',
    reference: 'ADV-2026-031',
    publishedAt: new Date('2026-10-06T14:38:00Z'),
    expiresAt: new Date('2026-10-20T00:00:00Z'),
    regionNames: ['Pinar del Río'],
    bookingCode: 'ABC12345',
    tripName: 'Eco-Tourism in Viñales',
    startDate: new Date('2026-10-13T00:00:00Z'),
    endDate: new Date('2026-10-20T00:00:00Z'),
    travelInfoUrl: 'https://example.test/travel-info#advisories',
    tripUrl: 'https://example.test/account/reservations/r1',
    locale: 'en',
    branding,
  };

  it('leads with the advisory, names the trip and the region, and links the conditions', () => {
    const email = travelAdvisoryEmail(input);
    expect(email.to).toBe('jane@example.test');
    expect(email.subject).toBe(
      'Travel advisory · Fuel queues in Pinar del Río, 6 Oct. · what it means for your trip',
    );
    expect(email.text).toContain('Advisory · caution');
    expect(email.text).toContain('Station queues of 2 h or more around Viñales.');
    expect(email.text).toContain('Source: Vereda drivers on the ground.');
    expect(email.text).toContain(
      'Eco-Tourism in Viñales (ABC12345), October 13 – 20, 2026, is in the area this advisory covers: Pinar del Río.',
    );
    expect(email.text).toContain(
      'See current conditions: https://example.test/travel-info#advisories',
    );
    expect(email.text).toContain('advisory ADV-2026-031');
    expect(email.text).not.toContain('acknowledge');
    expect(email.html).toContain('MINTUR License MINTUR-TEST-1234');
  });

  it('asks for the acknowledgement on a critical advisory and names the whole country', () => {
    const email = travelAdvisoryEmail({
      ...input,
      severity: 'CRITICAL',
      regionNames: [],
    });
    expect(email.text).toContain('Advisory · critical');
    expect(email.text).toContain('acknowledge it on the site');
    expect(email.text).toContain('covers: the whole country.');
  });

  it('writes the frame in the traveler’s language', () => {
    const email = travelAdvisoryEmail({ ...input, locale: 'es', cta: null });
    expect(email.subject.startsWith('Aviso de viaje · ')).toBe(true);
    expect(email.text).toContain('Aviso · precaución');
    expect(email.text).toContain(
      'Situación actual: https://example.test/travel-info#advisories',
    );
    const fr = travelAdvisoryEmail({ ...input, locale: 'fr' });
    expect(fr.text).toContain('Avis · vigilance');
  });
});

describe('disruptionOptionsEmail (E-Options)', () => {
  const input = {
    to: 'jane@example.test',
    name: 'Anders, Birgit',
    severity: 'MAJOR' as const,
    title: 'Power outage in Viñales',
    summary: 'Pinar del Río has had no grid power since last night.',
    options: [
      { key: 'A', title: 'Stay at the casa', detail: 'Price unchanged.' },
      { key: 'B', title: 'Move tonight', detail: 'Same price.' },
    ],
    defaultOptionKey: 'A',
    deadline: new Date('2026-10-06T22:00:00Z'),
    policy: 'Meal vouchers for outages over 12 h.',
    reference: 'DC-0931',
    bookingCode: 'VX6RQ4JD',
    sentAt: new Date('2026-10-06T18:33:00Z'),
    tripUrl: 'https://example.test/account/trips/abc',
    branding: { ...branding, supportPhone: '+53 7 204 2516' },
  };

  it('lists every option with its money consequence and the deadline in Havana time', () => {
    const email = disruptionOptionsEmail(input);
    expect(email.subject).toContain('Power outage in Viñales');
    // 22:00 UTC is 18:00 in Havana (UTC-4 in October).
    expect(email.subject).toContain('6:00');
    expect(email.text).toContain('A · Stay at the casa: Price unchanged.');
    expect(email.text).toContain('B · Move tonight: Same price.');
    expect(email.text).toContain('we keep option A and the desk calls you');
    expect(email.text).toContain('Compensation: Meal vouchers');
    expect(email.text).toContain('+53 7 204 2516');
    expect(email.html).toContain('https://example.test/account/trips/abc');
    expect(email.text).toContain('VX6RQ4JD · case DC-0931');
  });

  it("frames the desk's words in the traveler's language", () => {
    const es = disruptionOptionsEmail({ ...input, locale: 'es' });
    expect(es.text).toContain('Elige una opción antes de');
    expect(es.text).toContain('mantenemos la opción A');
    expect(es.text).toContain('Stay at the casa');
    const fr = disruptionOptionsEmail({ ...input, locale: 'fr-FR' });
    expect(fr.html).toContain('Choisir dans votre compte');
  });

  it('leaves out the phone line when the agency has none', () => {
    const email = disruptionOptionsEmail({ ...input, branding });
    expect(email.text).not.toContain('call the desk any time');
  });
});

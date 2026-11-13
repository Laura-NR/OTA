import {
  emailDate,
  emailLocale,
  emailMoney,
  emailWholeMoney,
  type EmailLocale,
} from '../locale';
import type { EmailMessage } from '../mailer';
import type { DisplayReference } from './display-reference';
import type { EmailBranding } from './magic-link';

export interface BookingReceivedEmailInput {
  to: string;
  name: string;
  bookingCode: string;
  packageName: string;
  startDate: Date;
  endDate: Date;
  total: number;
  currency: string;
  /** M9 C7b: the total in the traveler's display currency; omitted for EUR. */
  reference?: (DisplayReference & { total: number }) | null;
  portalUrl: string;
  locale?: string | null;
  branding: EmailBranding;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

interface Copy {
  subject: (code: string) => string;
  greeting: (name: string) => string;
  lede: (packageName: string) => string;
  request: string;
  dates: string;
  total: string;
  /** E-Received: "(about CA$ 4,588; the rate locks when you pay the deposit)". */
  reference: (amount: string, when: string) => string;
  locks: Record<DisplayReference['lockAt'], string>;
  locked: (date: string) => string;
  next: string;
  cta: string;
  footer: (code: string) => string;
}

const COPY: Record<EmailLocale, Copy> = {
  en: {
    subject: (code) => `We've got your request · ${code} · nothing is charged yet`,
    greeting: (name) => `We've got your request, ${name}.`,
    lede: (packageName) =>
      `Nothing is charged yet. We are confirming your dates for ${packageName}.`,
    request: 'Your request',
    dates: 'Dates',
    total: 'Total',
    reference: (amount, when) => `(about ${amount}; ${when})`,
    locks: {
      DEPOSIT: 'the rate locks when you pay the deposit',
      INVOICE: 'the rate locks when we send the invoice',
    },
    locked: (date) => `rate locked on ${date}`,
    next: 'Track your request and reply to us from your account.',
    cta: 'Track your request',
    footer: (code) => `Transactional email for booking ${code}.`,
  },
  es: {
    subject: (code) =>
      `Hemos recibido tu solicitud · ${code} · aún no se ha cobrado nada`,
    greeting: (name) => `Hemos recibido tu solicitud, ${name}.`,
    lede: (packageName) =>
      `Aún no se ha cobrado nada. Estamos confirmando tus fechas para ${packageName}.`,
    request: 'Tu solicitud',
    dates: 'Fechas',
    total: 'Total',
    reference: (amount, when) => `(unos ${amount}; ${when})`,
    locks: {
      DEPOSIT: 'la tasa se fija al pagar el depósito',
      INVOICE: 'la tasa se fija cuando enviamos la factura',
    },
    locked: (date) => `tasa fijada el ${date}`,
    next: 'Sigue tu solicitud y respóndenos desde tu cuenta.',
    cta: 'Sigue tu solicitud',
    footer: (code) => `Correo transaccional de la reserva ${code}.`,
  },
  fr: {
    subject: (code) =>
      `Nous avons reçu votre demande · ${code} · rien n'est encore débité`,
    greeting: (name) => `Nous avons reçu votre demande, ${name}.`,
    lede: (packageName) =>
      `Rien n'est encore débité. Nous confirmons vos dates pour ${packageName}.`,
    request: 'Votre demande',
    dates: 'Dates',
    total: 'Total',
    reference: (amount, when) => `(environ ${amount} ; ${when})`,
    locks: {
      DEPOSIT: "le taux est figé au paiement de l'acompte",
      INVOICE: "le taux est figé à l'envoi de la facture",
    },
    locked: (date) => `taux figé le ${date}`,
    next: 'Suivez votre demande et répondez-nous depuis votre compte.',
    cta: 'Suivre votre demande',
    footer: (code) => `E-mail transactionnel pour la réservation ${code}.`,
  },
};

/**
 * The E-Received email (Phase 6): sent when the Booking form lands a request,
 * so the traveler has the booking code and the promise that nothing was
 * charged even before the page changes. A traveler who sees another
 * currency also reads the total's "about" guide (M9 C7b).
 */
export function bookingReceivedEmail({
  to,
  name,
  bookingCode,
  packageName,
  startDate,
  endDate,
  total,
  currency,
  reference,
  portalUrl,
  locale: requestedLocale,
  branding,
}: BookingReceivedEmailInput): EmailMessage {
  const locale = emailLocale(requestedLocale);
  const copy = COPY[locale];
  const safeUrl = escapeHtml(portalUrl);
  const dates = `${emailDate(startDate, locale)} → ${emailDate(endDate, locale)}`;
  const amount = reference
    ? `${emailMoney(total, currency, locale)} ${copy.reference(
        emailWholeMoney(reference.total, reference.currency, locale),
        reference.lockedAt
          ? copy.locked(emailDate(reference.lockedAt, locale))
          : copy.locks[reference.lockAt],
      )}`
    : emailMoney(total, currency, locale);

  const html = `<!doctype html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937;">
  <h1 style="color: ${branding.primaryColor}; font-size: 20px;">${escapeHtml(branding.agencyName)}</h1>
  <p>${escapeHtml(copy.greeting(name))}</p>
  <p>${escapeHtml(copy.lede(packageName))}</p>
  <table style="border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:2px 16px 2px 0;color:#6b7280;vertical-align:top;">${copy.request}</td><td>${escapeHtml(bookingCode)} · ${escapeHtml(packageName)}</td></tr>
    <tr><td style="padding:2px 16px 2px 0;color:#6b7280;vertical-align:top;">${copy.dates}</td><td>${escapeHtml(dates)}</td></tr>
    <tr><td style="padding:2px 16px 2px 0;color:#6b7280;vertical-align:top;">${copy.total}</td><td>${escapeHtml(amount)}</td></tr>
  </table>
  <p>${escapeHtml(copy.next)}</p>
  <p>
    <a href="${safeUrl}"
       style="display:inline-block;background:${branding.primaryColor};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">
      ${escapeHtml(copy.cta)}
    </a>
  </p>
  <hr style="border:none;border-top:1px solid #e5e7eb;" />
  <p style="color:#6b7280;font-size:11px;">
    ${escapeHtml(branding.agencyName)} · MINTUR License ${escapeHtml(branding.licenseNumber)}
    ${branding.supportEmail ? ` · ${escapeHtml(branding.supportEmail)}` : ''}
    <br/>${escapeHtml(copy.footer(bookingCode))}
  </p>
</body>
</html>`;

  const text = `${branding.agencyName}\n\n${copy.greeting(name)}\n${copy.lede(packageName)}\n\n${copy.request}: ${bookingCode} · ${packageName}\n${copy.dates}: ${dates}\n${copy.total}: ${amount}\n\n${copy.next}\n${portalUrl}\n\nMINTUR License ${branding.licenseNumber}\n${copy.footer(bookingCode)}`;

  return {
    to,
    subject: copy.subject(bookingCode),
    html,
    text,
  };
}

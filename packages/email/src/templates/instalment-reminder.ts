import { emailDate, emailLocale, emailMoney, type EmailLocale } from '../locale';
import type { EmailMessage } from '../mailer';
import type { EmailBranding } from './magic-link';

export type ReminderInstalmentKind = 'DEPOSIT' | 'BALANCE' | 'FULL';

export interface InstalmentReminderEmailInput {
  to: string;
  name: string;
  bookingCode: string;
  kind: ReminderInstalmentKind;
  amount: number;
  currency: string;
  dueAt: Date;
  daysUntil: 1 | 3 | 7;
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
  kinds: Record<ReminderInstalmentKind, string>;
  subject: (days: number, kind: string, code: string) => string;
  greeting: (name: string) => string;
  body: (
    kind: string,
    amount: string,
    code: string,
    date: string,
    days: number,
  ) => string;
  cta: string;
  note: (code: string) => string;
}

const COPY: Record<EmailLocale, Copy> = {
  en: {
    kinds: { DEPOSIT: 'deposit', BALANCE: 'balance', FULL: 'payment' },
    subject: (days, kind, code) =>
      `${days} ${days === 1 ? 'day' : 'days'} left to pay your ${kind} · ${code}`,
    greeting: (name) => `Hello ${name},`,
    body: (kind, amount, code, date, days) =>
      `Your ${kind} of ${amount} for booking ${code} is due on ${date}, in ${days} ${days === 1 ? 'day' : 'days'}. Pay by bank transfer from your trip page; if you have already sent it, upload the proof there and we will extend the window by one business day.`,
    cta: 'Open your trip',
    note: (code) => `Transactional reminder for booking ${code}.`,
  },
  es: {
    kinds: { DEPOSIT: 'abono', BALANCE: 'saldo', FULL: 'pago' },
    subject: (days, kind, code) =>
      `${days === 1 ? 'Queda 1 día' : `Quedan ${days} días`} para pagar tu ${kind} · ${code}`,
    greeting: (name) => `Hola ${name}:`,
    body: (kind, amount, code, date, days) =>
      `Tu ${kind} de ${amount} de la reserva ${code} vence el ${date}, dentro de ${days} ${days === 1 ? 'día' : 'días'}. Paga por transferencia bancaria desde la página de tu viaje; si ya la enviaste, sube el justificante allí y ampliaremos el plazo un día hábil.`,
    cta: 'Abrir tu viaje',
    note: (code) => `Recordatorio transaccional de la reserva ${code}.`,
  },
  fr: {
    kinds: { DEPOSIT: 'acompte', BALANCE: 'solde', FULL: 'paiement' },
    subject: (days, kind, code) =>
      `${days === 1 ? 'Il reste 1 jour' : `Il reste ${days} jours`} pour payer votre ${kind} · ${code}`,
    greeting: (name) => `Bonjour ${name},`,
    body: (kind, amount, code, date, days) =>
      `Votre ${kind} de ${amount} pour la réservation ${code} arrive à échéance le ${date}, dans ${days} ${days === 1 ? 'jour' : 'jours'}. Payez par virement bancaire depuis la page de votre voyage ; si vous l'avez déjà envoyé, déposez le justificatif et nous prolongerons le délai d'un jour ouvré.`,
    cta: 'Ouvrir votre voyage',
    note: (code) => `Rappel transactionnel pour la réservation ${code}.`,
  },
};

/**
 * The balance reminder (Phase 6, E-Confirmed): 7, 3 and 1 days before an
 * instalment falls due. The scan decides the day; this only writes the email.
 */
export function instalmentReminderEmail({
  to,
  name,
  bookingCode,
  kind,
  amount,
  currency,
  dueAt,
  daysUntil,
  portalUrl,
  locale: requestedLocale,
  branding,
}: InstalmentReminderEmailInput): EmailMessage {
  const locale = emailLocale(requestedLocale);
  const copy = COPY[locale];
  const kindLabel = copy.kinds[kind];
  const amountLabel = emailMoney(amount, currency, locale);
  const dueDate = emailDate(dueAt, locale);
  const safeUrl = escapeHtml(portalUrl);
  const kindName = escapeHtml(kindLabel);

  const html = `<!doctype html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937;">
  <h1 style="color: ${branding.primaryColor}; font-size: 20px;">${escapeHtml(branding.agencyName)}</h1>
  <p>${escapeHtml(copy.greeting(name))}</p>
  <p>${escapeHtml(copy.body(kindLabel, amountLabel, bookingCode, dueDate, daysUntil))}</p>
  <p>
    <a href="${safeUrl}"
       style="display:inline-block;background:${branding.primaryColor};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">
      ${escapeHtml(copy.cta)}
    </a>
  </p>
  <p style="color:#6b7280;font-size:12px;">
    ${kindName} · ${escapeHtml(amountLabel)} · ${escapeHtml(dueDate)} · ${escapeHtml(bookingCode)}
  </p>
  <hr style="border:none;border-top:1px solid #e5e7eb;" />
  <p style="color:#6b7280;font-size:11px;">
    ${escapeHtml(branding.agencyName)} · MINTUR License ${escapeHtml(branding.licenseNumber)}
    ${branding.supportEmail ? ` · ${escapeHtml(branding.supportEmail)}` : ''}
    <br/>${escapeHtml(copy.note(bookingCode))}
  </p>
</body>
</html>`;

  const text = `${branding.agencyName}\n\n${copy.greeting(name)}\n${copy.body(kindLabel, amountLabel, bookingCode, dueDate, daysUntil)}\n\n${copy.cta}: ${portalUrl}\n\nMINTUR License ${branding.licenseNumber}\n${copy.note(bookingCode)}`;

  return {
    to,
    subject: copy.subject(daysUntil, kindLabel, bookingCode),
    html,
    text,
  };
}

import { emailInstant, emailLocale, emailMoney, type EmailLocale } from '../locale';
import type { EmailMessage } from '../mailer';
import type { EmailBranding } from './magic-link';
import { emailShell } from './shell';

export type WindowInstalmentKind = 'DEPOSIT' | 'FULL';

export interface PaymentWindowReminderEmailInput {
  to: string;
  name: string;
  bookingCode: string;
  kind: WindowInstalmentKind;
  amount: number;
  currency: string;
  /** The instant the payment window closes. */
  dueAt: Date;
  hoursLeft: 24 | 2;
  portalUrl: string;
  locale?: string | null;
  branding: EmailBranding;
}

interface Copy {
  kinds: Record<WindowInstalmentKind, string>;
  subject: (hours: number, kind: string, code: string) => string;
  greeting: (name: string) => string;
  due: (kind: string, amount: string, code: string, deadline: string) => string;
  proof: string;
  longer: string;
  cta: string;
  note: (code: string) => string;
}

const COPY: Record<EmailLocale, Copy> = {
  en: {
    kinds: { DEPOSIT: 'deposit', FULL: 'payment' },
    subject: (hours, kind, code) => `${hours} hours left to pay your ${kind} · ${code}`,
    greeting: (name) => `Hello ${name},`,
    due: (kind, amount, code, deadline) =>
      `Your ${kind} of ${amount} for booking ${code} is due by ${deadline}.`,
    proof:
      'Already sent a bank transfer? Upload the proof on your trip page; once our desk accepts it, the window is extended by one business day.',
    longer:
      'Need a little longer? Write to us from your trip page before the deadline and the desk can extend it.',
    cta: 'Pay from your trip page',
    note: (code) =>
      `Transactional reminder for booking ${code}. We never ask for card details by email.`,
  },
  es: {
    kinds: { DEPOSIT: 'abono', FULL: 'pago' },
    subject: (hours, kind, code) =>
      `Quedan ${hours} horas para pagar tu ${kind} · ${code}`,
    greeting: (name) => `Hola ${name}:`,
    due: (kind, amount, code, deadline) =>
      `Tu ${kind} de ${amount} de la reserva ${code} vence el ${deadline}.`,
    proof:
      '¿Ya enviaste la transferencia? Sube el justificante en la página de tu viaje; cuando nuestro equipo lo acepte, el plazo se amplía un día hábil.',
    longer:
      '¿Necesitas algo más de tiempo? Escríbenos desde la página de tu viaje antes del vencimiento y el equipo puede ampliarlo.',
    cta: 'Pagar desde tu viaje',
    note: (code) =>
      `Recordatorio transaccional de la reserva ${code}. Nunca pedimos datos de tarjeta por email.`,
  },
  fr: {
    kinds: { DEPOSIT: 'acompte', FULL: 'paiement' },
    subject: (hours, kind, code) =>
      `Plus que ${hours} heures pour payer votre ${kind} · ${code}`,
    greeting: (name) => `Bonjour ${name},`,
    due: (kind, amount, code, deadline) =>
      `Votre ${kind} de ${amount} pour la réservation ${code} est dû avant le ${deadline}.`,
    proof:
      "Virement déjà envoyé ? Déposez le justificatif sur la page de votre voyage ; une fois accepté par notre bureau, le délai est prolongé d'un jour ouvré.",
    longer:
      "Besoin d'un peu plus de temps ? Écrivez-nous depuis la page de votre voyage avant l'échéance et le bureau peut la prolonger.",
    cta: 'Payer depuis votre voyage',
    note: (code) =>
      `Rappel transactionnel pour la réservation ${code}. Nous ne demandons jamais de données de carte par e-mail.`,
  },
};

/**
 * E-Reminder (Phase 6): 24 hours and 2 hours before the first payment's
 * window closes. Nothing is released automatically when it does (M4 D4: the
 * desk decides), so the email does not say so.
 */
export function paymentWindowReminderEmail({
  to,
  name,
  bookingCode,
  kind,
  amount,
  currency,
  dueAt,
  hoursLeft,
  portalUrl,
  locale: requestedLocale,
  branding,
}: PaymentWindowReminderEmailInput): EmailMessage {
  const locale = emailLocale(requestedLocale);
  const copy = COPY[locale];
  const kindLabel = copy.kinds[kind];
  const { html, text } = emailShell({
    branding,
    greeting: copy.greeting(name),
    paragraphs: [
      copy.due(
        kindLabel,
        emailMoney(amount, currency, locale),
        bookingCode,
        emailInstant(dueAt, locale),
      ),
      copy.proof,
      copy.longer,
    ],
    cta: { label: copy.cta, url: portalUrl },
    note: copy.note(bookingCode),
  });
  return { to, subject: copy.subject(hoursLeft, kindLabel, bookingCode), html, text };
}

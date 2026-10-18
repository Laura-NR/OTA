import {
  emailDate,
  emailDateRange,
  emailLocale,
  emailMoney,
  type EmailLocale,
} from '../locale';
import type { EmailMessage } from '../mailer';
import type { EmailBranding } from './magic-link';
import { emailShell } from './shell';

export interface BookingSecuredEmailInput {
  to: string;
  name: string;
  bookingCode: string;
  /** The package's name, or null for a custom trip. */
  tripName: string | null;
  startDate: Date;
  endDate: Date;
  total: number;
  currency: string;
  /** The deposit plan, when the booking offers one (M4). */
  deposit: {
    amount: number;
    percent: number;
    balance: number;
    balanceDueAt: Date;
  } | null;
  /** How long the traveler has to pay once a payment is chosen. */
  windowHours: number;
  portalUrl: string;
  locale?: string | null;
  branding: EmailBranding;
}

interface Copy {
  customTrip: string;
  subject: (code: string) => string;
  greeting: (name: string) => string;
  secured: (trip: string, dates: string) => string;
  choose: string;
  depositOption: (
    amount: string,
    percent: number,
    balance: string,
    date: string,
  ) => string;
  fullOption: (amount: string) => string;
  fullOnly: (amount: string) => string;
  window: (hours: number) => string;
  documents: string;
  cta: string;
  note: (code: string) => string;
}

const COPY: Record<EmailLocale, Copy> = {
  en: {
    customTrip: 'Your custom trip',
    subject: (code) => `Your trip is secured · choose how to pay · ${code}`,
    greeting: (name) => `Hello ${name},`,
    secured: (trip, dates) =>
      `Good news: every host on ${trip}, ${dates}, has confirmed. Your trip is secured.`,
    choose: 'To lock it in, choose a payment on your trip page:',
    depositOption: (amount, percent, balance, date) =>
      `a ${percent} % deposit of ${amount} now, and the balance of ${balance} by ${date};`,
    fullOption: (amount) => `or the full ${amount} now.`,
    fullOnly: (amount) => `the full ${amount}.`,
    window: (hours) =>
      `Once you choose, you have ${hours} hours to pay by bank transfer; the bank details and your reference are on your trip page.`,
    documents:
      'Your invoice and vouchers are issued as soon as your first payment arrives.',
    cta: 'Choose and pay',
    note: (code) =>
      `Transactional email for booking ${code}. We never ask for card details by email.`,
  },
  es: {
    customTrip: 'Tu viaje a medida',
    subject: (code) => `Tu viaje está asegurado · elige cómo pagar · ${code}`,
    greeting: (name) => `Hola ${name}:`,
    secured: (trip, dates) =>
      `Buenas noticias: todos los anfitriones de ${trip}, ${dates}, han confirmado. Tu viaje está asegurado.`,
    choose: 'Para cerrarlo, elige un pago en la página de tu viaje:',
    depositOption: (amount, percent, balance, date) =>
      `un abono del ${percent} % de ${amount} ahora y el saldo de ${balance} antes del ${date};`,
    fullOption: (amount) => `o el importe completo de ${amount} ahora.`,
    fullOnly: (amount) => `el importe completo de ${amount}.`,
    window: (hours) =>
      `Una vez elegido, tienes ${hours} horas para pagar por transferencia; los datos bancarios y tu referencia están en la página de tu viaje.`,
    documents: 'Tu factura y tus bonos se emiten en cuanto llega tu primer pago.',
    cta: 'Elegir y pagar',
    note: (code) =>
      `Email transaccional de la reserva ${code}. Nunca pedimos datos de tarjeta por email.`,
  },
  fr: {
    customTrip: 'Votre voyage sur mesure',
    subject: (code) => `Votre voyage est garanti · choisissez comment payer · ${code}`,
    greeting: (name) => `Bonjour ${name},`,
    secured: (trip, dates) =>
      `Bonne nouvelle : tous les hôtes de ${trip}, ${dates}, ont confirmé. Votre voyage est garanti.`,
    choose: 'Pour le confirmer, choisissez un paiement sur la page de votre voyage :',
    depositOption: (amount, percent, balance, date) =>
      `un acompte de ${percent} % de ${amount} maintenant, puis le solde de ${balance} avant le ${date} ;`,
    fullOption: (amount) => `ou la totalité, ${amount}, maintenant.`,
    fullOnly: (amount) => `la totalité, ${amount}.`,
    window: (hours) =>
      `Une fois votre choix fait, vous avez ${hours} heures pour payer par virement ; les coordonnées bancaires et votre référence sont sur la page de votre voyage.`,
    documents:
      'Votre facture et vos bons sont émis dès réception de votre premier paiement.',
    cta: 'Choisir et payer',
    note: (code) =>
      `E-mail transactionnel pour la réservation ${code}. Nous ne demandons jamais de données de carte par e-mail.`,
  },
};

/**
 * E-Invoice (Phase 6): the booking is SECURED_AND_INVOICED. M4 lets the
 * traveler choose the deposit or the full amount, and the payment window
 * starts with that choice, so the email offers the choice rather than a
 * deadline. The invoice is issued at confirmation (spec §4.4), so nothing is
 * attached yet.
 */
export function bookingSecuredEmail({
  to,
  name,
  bookingCode,
  tripName,
  startDate,
  endDate,
  total,
  currency,
  deposit,
  windowHours,
  portalUrl,
  locale: requestedLocale,
  branding,
}: BookingSecuredEmailInput): EmailMessage {
  const locale = emailLocale(requestedLocale);
  const copy = COPY[locale];
  const money = (value: number) => emailMoney(value, currency, locale);
  const { html, text } = emailShell({
    branding,
    greeting: copy.greeting(name),
    paragraphs: [
      copy.secured(
        tripName ?? copy.customTrip,
        emailDateRange(startDate, endDate, locale),
      ),
      copy.choose,
    ],
    points: [
      ...(deposit
        ? [
            copy.depositOption(
              money(deposit.amount),
              deposit.percent,
              money(deposit.balance),
              emailDate(deposit.balanceDueAt, locale),
            ),
          ]
        : []),
      deposit ? copy.fullOption(money(total)) : copy.fullOnly(money(total)),
    ],
    closing: [copy.window(windowHours), copy.documents],
    cta: { label: copy.cta, url: portalUrl },
    note: copy.note(bookingCode),
  });
  return { to, subject: copy.subject(bookingCode), html, text };
}

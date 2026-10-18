import {
  emailDate,
  emailDateRange,
  emailLocale,
  emailMoney,
  type EmailLocale,
} from '../locale';
import type { EmailAttachment, EmailMessage } from '../mailer';
import type { EmailBranding } from './magic-link';
import { emailShell } from './shell';

type InstalmentKind = 'DEPOSIT' | 'BALANCE' | 'FULL';

export interface BookingConfirmedEmailInput {
  to: string;
  name: string;
  bookingCode: string;
  /** The package's name, or null for a custom trip. */
  tripName: string | null;
  startDate: Date;
  endDate: Date;
  currency: string;
  /** The payment that confirmed the booking; null for one paid before M4. */
  paid: { kind: InstalmentKind; amount: number } | null;
  /** The next instalment still due, or null when the trip is paid in full. */
  next: { kind: InstalmentKind; amount: number; dueAt: Date } | null;
  /** The voucher is held until every US traveler has certified (M3). */
  voucherHeld: boolean;
  /** The traveler's documents issued at confirmation (voucher, invoice). */
  attachments: EmailAttachment[];
  confirmationUrl: string;
  locale?: string | null;
  branding: EmailBranding;
}

interface Copy {
  customTrip: string;
  kinds: Record<InstalmentKind, string>;
  subject: (trip: string, dates: string, code: string) => string;
  greeting: (name: string) => string;
  received: (kind: string, amount: string) => string;
  confirmed: (trip: string, dates: string) => string;
  attached: string;
  held: string;
  account: string;
  next: (kind: string, amount: string, date: string) => string;
  paidInFull: string;
  cta: string;
  note: (code: string) => string;
}

const COPY: Record<EmailLocale, Copy> = {
  en: {
    customTrip: 'Your custom trip',
    kinds: { DEPOSIT: 'deposit', BALANCE: 'balance', FULL: 'payment' },
    subject: (trip, dates, code) => `Confirmed: ${trip}, ${dates} · ${code}`,
    greeting: (name) => `Hello ${name},`,
    received: (kind, amount) => `We received your ${kind} of ${amount}.`,
    confirmed: (trip, dates) => `${trip}, ${dates}, is booked.`,
    attached: 'Your voucher and invoice are attached.',
    held: 'Your invoice is attached. The voucher follows once every US traveler has certified their travel category on your trip page.',
    account:
      'Everything is also on your confirmation page, with what is left to do before you fly.',
    next: (kind, amount, date) =>
      `Next: the ${kind} of ${amount} by ${date}. We remind you by email 7, 3 and 1 days before.`,
    paidInFull: 'Your trip is paid in full.',
    cta: 'Open your confirmation',
    note: (code) => `Transactional email for booking ${code}.`,
  },
  es: {
    customTrip: 'Tu viaje a medida',
    kinds: { DEPOSIT: 'abono', BALANCE: 'saldo', FULL: 'pago' },
    subject: (trip, dates, code) => `Confirmado: ${trip}, ${dates} · ${code}`,
    greeting: (name) => `Hola ${name}:`,
    received: (kind, amount) => `Hemos recibido tu ${kind} de ${amount}.`,
    confirmed: (trip, dates) => `${trip}, ${dates}, está reservado.`,
    attached: 'Adjuntamos tu bono y tu factura.',
    held: 'Adjuntamos tu factura. El bono llegará cuando todos los viajeros de EE. UU. hayan certificado su categoría de viaje en la página de tu viaje.',
    account:
      'Todo está también en tu página de confirmación, con lo que queda por hacer antes de volar.',
    next: (kind, amount, date) =>
      `Siguiente: el ${kind} de ${amount} antes del ${date}. Te lo recordamos por email 7, 3 y 1 días antes.`,
    paidInFull: 'Tu viaje está pagado por completo.',
    cta: 'Abrir tu confirmación',
    note: (code) => `Email transaccional de la reserva ${code}.`,
  },
  fr: {
    customTrip: 'Votre voyage sur mesure',
    kinds: { DEPOSIT: 'acompte', BALANCE: 'solde', FULL: 'paiement' },
    subject: (trip, dates, code) => `Confirmé : ${trip}, ${dates} · ${code}`,
    greeting: (name) => `Bonjour ${name},`,
    received: (kind, amount) => `Nous avons bien reçu votre ${kind} de ${amount}.`,
    confirmed: (trip, dates) => `${trip}, ${dates}, est réservé.`,
    attached: 'Votre bon et votre facture sont joints.',
    held: 'Votre facture est jointe. Le bon suivra dès que chaque voyageur américain aura certifié sa catégorie de voyage sur la page de votre voyage.',
    account:
      'Tout se trouve aussi sur votre page de confirmation, avec ce qui reste à faire avant le départ.',
    next: (kind, amount, date) =>
      `Ensuite : le ${kind} de ${amount} avant le ${date}. Nous vous le rappelons par e-mail 7, 3 et 1 jours avant.`,
    paidInFull: 'Votre voyage est entièrement payé.',
    cta: 'Ouvrir votre confirmation',
    note: (code) => `E-mail transactionnel pour la réservation ${code}.`,
  },
};

/**
 * E-Confirmed (Phase 6): the first payment has confirmed the booking. It
 * carries the documents issued at confirmation and links to the Confirmation
 * screen. The board's insurance, offline-kit and host blocks have no data
 * behind them yet, so they are not written (ADR 0006).
 */
export function bookingConfirmedEmail({
  to,
  name,
  bookingCode,
  tripName,
  startDate,
  endDate,
  currency,
  paid,
  next,
  voucherHeld,
  attachments,
  confirmationUrl,
  locale: requestedLocale,
  branding,
}: BookingConfirmedEmailInput): EmailMessage {
  const locale = emailLocale(requestedLocale);
  const copy = COPY[locale];
  const trip = tripName ?? copy.customTrip;
  const dates = emailDateRange(startDate, endDate, locale);
  const money = (value: number) => emailMoney(value, currency, locale);
  const { html, text } = emailShell({
    branding,
    greeting: copy.greeting(name),
    paragraphs: [
      [
        paid ? copy.received(copy.kinds[paid.kind], money(paid.amount)) : null,
        copy.confirmed(trip, dates),
      ]
        .filter(Boolean)
        .join(' '),
      ...(voucherHeld ? [copy.held] : attachments.length > 0 ? [copy.attached] : []),
      next
        ? copy.next(
            copy.kinds[next.kind],
            money(next.amount),
            emailDate(next.dueAt, locale),
          )
        : copy.paidInFull,
      copy.account,
    ],
    cta: { label: copy.cta, url: confirmationUrl },
    note: copy.note(bookingCode),
  });
  return {
    to,
    subject: copy.subject(trip, dates, bookingCode),
    html,
    text,
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

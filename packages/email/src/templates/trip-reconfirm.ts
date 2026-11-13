import {
  emailDate,
  emailDateRange,
  emailInstant,
  emailLocale,
  emailMoney,
  type EmailLocale,
} from '../locale';
import type { EmailAttachment, EmailMessage } from '../mailer';
import type { EmailBranding } from './magic-link';
import { emailShell } from './shell';

export interface TripReconfirmEmailInput {
  to: string;
  name: string;
  bookingCode: string;
  /** The package's name, or null for a custom trip. */
  tripName: string | null;
  startDate: Date;
  endDate: Date;
  /** The first service: where and when the trip starts. */
  firstMeeting: { province: string | null; startsAt: Date } | null;
  /** A balance still due, if any. */
  balance: { amount: number; currency: string; dueAt: Date } | null;
  /** The voucher, attached when it has been issued. */
  voucher: EmailAttachment | null;
  portalUrl: string;
  travelInfoUrl: string;
  locale?: string | null;
  branding: EmailBranding;
}

interface Copy {
  customTrip: string;
  subject: (trip: string, code: string) => string;
  greeting: (name: string) => string;
  lede: (trip: string, dates: string) => string;
  meeting: (place: string, when: string) => string;
  flight: string;
  balance: (amount: string, date: string) => string;
  voucher: string;
  conditions: (url: string) => string;
  cuba: string;
  cta: string;
  note: (code: string) => string;
}

const COPY: Record<EmailLocale, Copy> = {
  en: {
    customTrip: 'your trip',
    subject: (trip, code) => `One week to go · ${trip} · ${code}`,
    greeting: (name) => `Hello ${name},`,
    lede: (trip, dates) =>
      `Seven days to ${trip}, ${dates}. A few things before you fly:`,
    meeting: (place, when) => `Your first service starts in ${place} on ${when}.`,
    flight:
      'Send us your arrival flight and time in your trip messages, so the desk can line up your first day.',
    balance: (amount, date) => `Your balance of ${amount} is due by ${date}.`,
    voucher: 'Your voucher is attached; keep a copy on your phone and on paper.',
    conditions: (url) => `Entry rules and conditions in Cuba change often: ${url}`,
    cuba: 'Cuba',
    cta: 'Open your trip',
    note: (code) => `Transactional email for booking ${code}.`,
  },
  es: {
    customTrip: 'tu viaje',
    subject: (trip, code) => `Falta una semana · ${trip} · ${code}`,
    greeting: (name) => `Hola ${name}:`,
    lede: (trip, dates) =>
      `Faltan siete días para ${trip}, ${dates}. Algunas cosas antes de volar:`,
    meeting: (place, when) => `Tu primer servicio empieza en ${place} el ${when}.`,
    flight:
      'Envíanos tu vuelo y hora de llegada en los mensajes de tu viaje para que el equipo prepare tu primer día.',
    balance: (amount, date) => `Tu saldo de ${amount} vence el ${date}.`,
    voucher: 'Adjuntamos tu bono; guarda una copia en el móvil y otra en papel.',
    conditions: (url) =>
      `Las normas de entrada y la situación en Cuba cambian a menudo: ${url}`,
    cuba: 'Cuba',
    cta: 'Abrir tu viaje',
    note: (code) => `Email transaccional de la reserva ${code}.`,
  },
  fr: {
    customTrip: 'votre voyage',
    subject: (trip, code) => `Plus qu'une semaine · ${trip} · ${code}`,
    greeting: (name) => `Bonjour ${name},`,
    lede: (trip, dates) =>
      `Plus que sept jours avant ${trip}, ${dates}. Quelques points avant le départ :`,
    meeting: (place, when) => `Votre premier service commence à ${place} le ${when}.`,
    flight:
      "Envoyez-nous votre vol et votre heure d'arrivée dans les messages de votre voyage, pour que le bureau prépare votre premier jour.",
    balance: (amount, date) => `Votre solde de ${amount} est dû avant le ${date}.`,
    voucher:
      'Votre bon est joint ; gardez-en une copie sur votre téléphone et une sur papier.',
    conditions: (url) =>
      `Les règles d'entrée et la situation à Cuba changent souvent : ${url}`,
    cuba: 'Cuba',
    cta: 'Ouvrir votre voyage',
    note: (code) => `E-mail transactionnel pour la réservation ${code}.`,
  },
};

/**
 * E-Reconfirm (Phase 6), reduced: seven days before a confirmed trip, the
 * first meeting point, a request for the arrival flight, any balance still
 * due and the voucher. The board's flight check, desk call, offline kit and
 * morning check-ins have no data or channel yet (ADR 0006).
 */
export function tripReconfirmEmail({
  to,
  name,
  bookingCode,
  tripName,
  startDate,
  endDate,
  firstMeeting,
  balance,
  voucher,
  portalUrl,
  travelInfoUrl,
  locale: requestedLocale,
  branding,
}: TripReconfirmEmailInput): EmailMessage {
  const locale = emailLocale(requestedLocale);
  const copy = COPY[locale];
  const trip = tripName ?? copy.customTrip;
  const { html, text } = emailShell({
    branding,
    greeting: copy.greeting(name),
    paragraphs: [copy.lede(trip, emailDateRange(startDate, endDate, locale))],
    points: [
      ...(firstMeeting
        ? [
            copy.meeting(
              firstMeeting.province ?? copy.cuba,
              emailInstant(firstMeeting.startsAt, locale),
            ),
          ]
        : []),
      copy.flight,
      ...(balance
        ? [
            copy.balance(
              emailMoney(balance.amount, balance.currency, locale),
              emailDate(balance.dueAt, locale),
            ),
          ]
        : []),
      ...(voucher ? [copy.voucher] : []),
      copy.conditions(travelInfoUrl),
    ],
    cta: { label: copy.cta, url: portalUrl },
    note: copy.note(bookingCode),
  });
  return {
    to,
    subject: copy.subject(trip, bookingCode),
    html,
    text,
    ...(voucher ? { attachments: [voucher] } : {}),
  };
}

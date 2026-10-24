import { emailDate, emailLocale, emailMoney, type EmailLocale } from '../locale';
import type { EmailMessage } from '../mailer';
import type { EmailBranding } from './magic-link';
import { emailShell } from './shell';

/** The request's step the email reports (M10 D10). */
export type EventRequestEmailKind =
  'RECEIVED' | 'REQUESTING' | 'CONFIRMED' | 'UNAVAILABLE';

export interface EventRequestEmailInput {
  kind: EventRequestEmailKind;
  to: string;
  name: string;
  reference: string;
  eventName: string;
  /** "2 seats · Numbered seat · 3 nights", in the email's language. */
  seatsLine: string;
  /** RECEIVED: the hours the desk takes to answer (the M9 threshold). */
  answerHours?: number;
  /** The date the desk confirms seats by, when the event sets one. */
  confirmBy?: Date | null;
  /** CONFIRMED: what the seats add to the booking. */
  amounts?: {
    tickets: number;
    fee: number;
    total: number;
    currency: string;
    /** Due date of the ticket instalment when the price was already locked. */
    dueAt: Date | null;
    bookingCode: string;
  } | null;
  /** UNAVAILABLE: the desk's reason. */
  reason?: string | null;
  portalUrl: string;
  locale?: string | null;
  branding: EmailBranding;
}

interface Copy {
  subject: Record<EventRequestEmailKind, (event: string) => string>;
  greeting: (name: string) => string;
  lede: Record<EventRequestEmailKind, (event: string, hours: number) => string>;
  confirmBy: (date: string) => string;
  nothingCharged: string;
  amounts: (tickets: string, fee: string, total: string, code: string) => string;
  due: (date: string) => string;
  withSchedule: string;
  reason: (reason: string) => string;
  cta: string;
  note: (reference: string) => string;
}

const COPY: Record<EmailLocale, Copy> = {
  en: {
    subject: {
      RECEIVED: (event) => `Event request received · ${event} · nothing is charged`,
      REQUESTING: (event) => `We are requesting your seats · ${event}`,
      CONFIRMED: (event) => `Your seats are confirmed · ${event}`,
      UNAVAILABLE: (event) => `We could not get your seats · ${event}`,
    },
    greeting: (name) => `Hello ${name},`,
    lede: {
      RECEIVED: (event, hours) =>
        `We have your request for ${event}. A specialist checks within ${hours} hours that we can request these seats.`,
      REQUESTING: (event) =>
        `We can request your seats for ${event} through licensed sellers, and we are doing so now.`,
      CONFIRMED: (event) => `Your seats for ${event} are confirmed and on your booking.`,
      UNAVAILABLE: (event) => `We could not get the seats you asked for at ${event}.`,
    },
    confirmBy: (date) => `We confirm seats by ${date}.`,
    nothingCharged: 'Nothing is charged until the seats are confirmed.',
    amounts: (tickets, fee, total, code) =>
      `Tickets ${tickets} and the concierge fee ${fee} add ${total} to booking ${code}.`,
    due: (date) => `They are due by ${date}.`,
    withSchedule: 'They are paid with your booking’s payments.',
    reason: (reason) => `The desk’s note: ${reason}`,
    cta: 'See your request',
    note: (reference) => `Transactional email for event request ${reference}.`,
  },
  es: {
    subject: {
      RECEIVED: (event) => `Solicitud de evento recibida · ${event} · no se cobra nada`,
      REQUESTING: (event) => `Estamos solicitando tus entradas · ${event}`,
      CONFIRMED: (event) => `Tus entradas están confirmadas · ${event}`,
      UNAVAILABLE: (event) => `No pudimos conseguir tus entradas · ${event}`,
    },
    greeting: (name) => `Hola ${name}:`,
    lede: {
      RECEIVED: (event, hours) =>
        `Tenemos tu solicitud para ${event}. Un especialista comprueba en ${hours} horas que podemos pedir estas entradas.`,
      REQUESTING: (event) =>
        `Podemos pedir tus entradas para ${event} a vendedores autorizados, y ya lo estamos haciendo.`,
      CONFIRMED: (event) =>
        `Tus entradas para ${event} están confirmadas y añadidas a tu reserva.`,
      UNAVAILABLE: (event) =>
        `No pudimos conseguir las entradas que pediste para ${event}.`,
    },
    confirmBy: (date) => `Confirmamos las entradas antes del ${date}.`,
    nothingCharged: 'No se cobra nada hasta que las entradas estén confirmadas.',
    amounts: (tickets, fee, total, code) =>
      `Las entradas (${tickets}) y la tarifa de conserjería (${fee}) suman ${total} a la reserva ${code}.`,
    due: (date) => `Vencen el ${date}.`,
    withSchedule: 'Se pagan con los pagos de tu reserva.',
    reason: (reason) => `Nota de la mesa: ${reason}`,
    cta: 'Ver tu solicitud',
    note: (reference) => `Correo transaccional de la solicitud de evento ${reference}.`,
  },
  fr: {
    subject: {
      RECEIVED: (event) => `Demande d’événement reçue · ${event} · rien n’est débité`,
      REQUESTING: (event) => `Nous demandons vos places · ${event}`,
      CONFIRMED: (event) => `Vos places sont confirmées · ${event}`,
      UNAVAILABLE: (event) => `Nous n’avons pas pu obtenir vos places · ${event}`,
    },
    greeting: (name) => `Bonjour ${name},`,
    lede: {
      RECEIVED: (event, hours) =>
        `Nous avons votre demande pour ${event}. Un spécialiste vérifie sous ${hours} heures que nous pouvons demander ces places.`,
      REQUESTING: (event) =>
        `Nous pouvons demander vos places pour ${event} auprès de vendeurs agréés, et nous le faisons maintenant.`,
      CONFIRMED: (event) =>
        `Vos places pour ${event} sont confirmées et ajoutées à votre réservation.`,
      UNAVAILABLE: (event) =>
        `Nous n’avons pas pu obtenir les places demandées pour ${event}.`,
    },
    confirmBy: (date) => `Nous confirmons les places avant le ${date}.`,
    nothingCharged: 'Rien n’est débité tant que les places ne sont pas confirmées.',
    amounts: (tickets, fee, total, code) =>
      `Les billets (${tickets}) et les frais de conciergerie (${fee}) ajoutent ${total} à la réservation ${code}.`,
    due: (date) => `Ils sont dus le ${date}.`,
    withSchedule: 'Ils sont réglés avec les paiements de votre réservation.',
    reason: (reason) => `La note du bureau : ${reason}`,
    cta: 'Voir votre demande',
    note: (reference) => `E-mail transactionnel de la demande d’événement ${reference}.`,
  },
};

/**
 * M10 D10: the traveler hears of each step of an event request, in their
 * language. Nothing is charged before CONFIRMED, which states what the seats
 * add to the booking and, once its price was locked, when they fall due.
 */
export function eventRequestEmail({
  kind,
  to,
  name,
  reference,
  eventName,
  seatsLine,
  answerHours = 48,
  confirmBy,
  amounts,
  reason,
  portalUrl,
  locale: requestedLocale,
  branding,
}: EventRequestEmailInput): EmailMessage {
  const locale = emailLocale(requestedLocale);
  const copy = COPY[locale];
  const paragraphs = [copy.lede[kind](eventName, answerHours), seatsLine];
  if (kind === 'RECEIVED' || kind === 'REQUESTING') {
    if (confirmBy) paragraphs.push(copy.confirmBy(emailDate(confirmBy, locale)));
    paragraphs.push(copy.nothingCharged);
  }
  if (kind === 'CONFIRMED' && amounts) {
    const money = (value: number) => emailMoney(value, amounts.currency, locale);
    paragraphs.push(
      copy.amounts(
        money(amounts.tickets),
        money(amounts.fee),
        money(amounts.total),
        amounts.bookingCode,
      ),
      amounts.dueAt ? copy.due(emailDate(amounts.dueAt, locale)) : copy.withSchedule,
    );
  }
  if (kind === 'UNAVAILABLE') {
    if (reason) paragraphs.push(copy.reason(reason));
    paragraphs.push(copy.nothingCharged);
  }
  const { html, text } = emailShell({
    branding,
    greeting: copy.greeting(name),
    paragraphs,
    cta: { label: copy.cta, url: portalUrl },
    note: copy.note(reference),
  });
  return { to, subject: copy.subject[kind](eventName), html, text };
}

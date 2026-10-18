import { emailLocale, type EmailLocale } from '../locale';
import type { EmailMessage } from '../mailer';
import type { EmailBranding } from './magic-link';
import { emailShell } from './shell';

export interface ReviewRequestEmailInput {
  to: string;
  name: string;
  bookingCode: string;
  /** The package's name, or null for a custom trip. */
  tripName: string | null;
  /** The one reminder, sent when the first request went unanswered. */
  reminder: boolean;
  portalUrl: string;
  locale?: string | null;
  branding: EmailBranding;
}

interface Copy {
  customTrip: string;
  subject: (trip: string, code: string, reminder: boolean) => string;
  greeting: (name: string) => string;
  ask: (trip: string) => string;
  how: string;
  where: string;
  last: string;
  cta: string;
  note: (code: string) => string;
}

const COPY: Record<EmailLocale, Copy> = {
  en: {
    customTrip: 'your trip',
    subject: (trip, code, reminder) =>
      reminder ? `A minute for ${trip}? · ${code}` : `How was ${trip}? · ${code}`,
    greeting: (name) => `Welcome home, ${name}.`,
    ask: (trip) => `How was ${trip}?`,
    how: 'Rate it from 1 to 5 on your trip page; a comment is optional.',
    where: 'Your rating goes to our operations team and helps us and your hosts improve.',
    last: 'This is the only reminder we send.',
    cta: 'Rate your trip',
    note: (code) => `One request per trip, for booking ${code}.`,
  },
  es: {
    customTrip: 'tu viaje',
    subject: (trip, code, reminder) =>
      reminder ? `¿Un minuto para ${trip}? · ${code}` : `¿Qué tal ${trip}? · ${code}`,
    greeting: (name) => `Hola de nuevo, ${name}.`,
    ask: (trip) => `¿Qué tal ${trip}?`,
    how: 'Valóralo de 1 a 5 en la página de tu viaje; el comentario es opcional.',
    where:
      'Tu valoración llega a nuestro equipo de operaciones y nos ayuda a mejorar, a nosotros y a tus anfitriones.',
    last: 'Es el único recordatorio que enviamos.',
    cta: 'Valorar tu viaje',
    note: (code) => `Una sola petición por viaje, para la reserva ${code}.`,
  },
  fr: {
    customTrip: 'votre voyage',
    subject: (trip, code, reminder) =>
      reminder
        ? `Une minute pour ${trip} ? · ${code}`
        : `Comment s'est passé ${trip} ? · ${code}`,
    greeting: (name) => `Bon retour, ${name}.`,
    ask: (trip) => `Comment s'est passé ${trip} ?`,
    how: 'Notez-le de 1 à 5 sur la page de votre voyage ; le commentaire est facultatif.',
    where:
      'Votre note parvient à notre équipe des opérations et nous aide, nous et vos hôtes, à progresser.',
    last: "C'est le seul rappel que nous envoyons.",
    cta: 'Noter votre voyage',
    note: (code) => `Une seule demande par voyage, pour la réservation ${code}.`,
  },
};

/**
 * E-NPS (Phase 6), adapted: 24 hours after a trip is completed, and once more
 * five days later if it is still unrated, ask for the trip review (the Review
 * model's 1–5 CSAT). The board's 0–10 recommendation score and per-host
 * ratings need their own fields, so they wait for a migration (ADR 0006).
 */
export function reviewRequestEmail({
  to,
  name,
  bookingCode,
  tripName,
  reminder,
  portalUrl,
  locale: requestedLocale,
  branding,
}: ReviewRequestEmailInput): EmailMessage {
  const locale = emailLocale(requestedLocale);
  const copy = COPY[locale];
  const trip = tripName ?? copy.customTrip;
  const { html, text } = emailShell({
    branding,
    greeting: copy.greeting(name),
    paragraphs: [copy.ask(trip), copy.how, copy.where, ...(reminder ? [copy.last] : [])],
    cta: { label: copy.cta, url: portalUrl },
    note: copy.note(bookingCode),
  });
  return { to, subject: copy.subject(trip, bookingCode, reminder), html, text };
}

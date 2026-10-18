import {
  emailDate,
  emailDateRange,
  emailInstant,
  emailList,
  emailLocale,
  type EmailLocale,
} from '../locale';
import type { EmailMessage } from '../mailer';
import type { EmailBranding } from './magic-link';
import { emailShell } from './shell';

export type AdvisoryEmailSeverity = 'CAUTION' | 'CRITICAL';

export interface TravelAdvisoryEmailInput {
  to: string;
  name: string;
  severity: AdvisoryEmailSeverity;
  /** The advisory's text, already in the traveler's language when it exists. */
  headline: string;
  body: string;
  /** The advisory's call to action, the button's label; null uses the default. */
  cta: string | null;
  source: string;
  reference: string;
  publishedAt: Date;
  expiresAt: Date;
  /** The affected provinces' names; empty is the whole country. */
  regionNames: readonly string[];
  /** The traveler's earliest reached booking. */
  bookingCode: string;
  /** The package's name, or null for a custom trip. */
  tripName: string | null;
  startDate: Date;
  endDate: Date;
  travelInfoUrl: string;
  tripUrl: string;
  locale?: string | null;
  branding: EmailBranding;
}

interface Copy {
  severity: Record<AdvisoryEmailSeverity, string>;
  subject: (headline: string) => string;
  greeting: (name: string) => string;
  label: (severity: string) => string;
  source: (source: string) => string;
  wholeCountry: string;
  customTrip: string;
  meaning: (trip: string, dates: string, code: string, regions: string) => string;
  desk: string;
  acknowledge: string;
  messages: (url: string) => string;
  conditions: string;
  note: (published: string, reference: string, expires: string, code: string) => string;
}

const COPY: Record<EmailLocale, Copy> = {
  en: {
    severity: { CAUTION: 'caution', CRITICAL: 'critical' },
    subject: (headline) => `Travel advisory · ${headline} · what it means for your trip`,
    greeting: (name) => `Hello ${name},`,
    label: (severity) => `Advisory · ${severity}`,
    source: (source) => `Source: ${source}.`,
    wholeCountry: 'the whole country',
    customTrip: 'your trip',
    meaning: (trip, dates, code, regions) =>
      `We are writing because ${trip} (${code}), ${dates}, is in the area this advisory covers: ${regions}.`,
    desk: 'If a service in your trip has to change, the operations desk contacts you before it happens.',
    acknowledge:
      'This is a critical advisory. Please sign in and acknowledge it on the site so we know you have read it.',
    messages: (url) => `Questions? Message the desk from your trip: ${url}`,
    conditions: 'Current conditions',
    note: (published, reference, expires, code) =>
      `Published ${published} by the operations desk · advisory ${reference} · expires ${expires} unless renewed. Safety information for booking ${code}.`,
  },
  es: {
    severity: { CAUTION: 'precaución', CRITICAL: 'crítico' },
    subject: (headline) => `Aviso de viaje · ${headline} · qué significa para tu viaje`,
    greeting: (name) => `Hola ${name}:`,
    label: (severity) => `Aviso · ${severity}`,
    source: (source) => `Fuente: ${source}.`,
    wholeCountry: 'todo el país',
    customTrip: 'tu viaje',
    meaning: (trip, dates, code, regions) =>
      `Te escribimos porque ${trip} (${code}), ${dates}, está en la zona que cubre este aviso: ${regions}.`,
    desk: 'Si un servicio de tu viaje tiene que cambiar, el equipo de operaciones te contacta antes.',
    acknowledge:
      'Es un aviso crítico. Inicia sesión y confírmalo en la web para que sepamos que lo has leído.',
    messages: (url) => `¿Preguntas? Escribe al equipo desde tu viaje: ${url}`,
    conditions: 'Situación actual',
    note: (published, reference, expires, code) =>
      `Publicado el ${published} por el equipo de operaciones · aviso ${reference} · vence el ${expires} salvo renovación. Información de seguridad de la reserva ${code}.`,
  },
  fr: {
    severity: { CAUTION: 'vigilance', CRITICAL: 'critique' },
    subject: (headline) =>
      `Avis aux voyageurs · ${headline} · ce que cela change pour votre voyage`,
    greeting: (name) => `Bonjour ${name},`,
    label: (severity) => `Avis · ${severity}`,
    source: (source) => `Source : ${source}.`,
    wholeCountry: 'tout le pays',
    customTrip: 'votre voyage',
    meaning: (trip, dates, code, regions) =>
      `Nous vous écrivons car ${trip} (${code}), ${dates}, se trouve dans la zone concernée par cet avis : ${regions}.`,
    desk: "Si un service de votre voyage doit changer, le bureau des opérations vous contacte avant qu'il ne change.",
    acknowledge:
      "C'est un avis critique. Connectez-vous et confirmez-en la lecture sur le site pour que nous sachions que vous l'avez lu.",
    messages: (url) => `Des questions ? Écrivez au bureau depuis votre voyage : ${url}`,
    conditions: 'Conditions actuelles',
    note: (published, reference, expires, code) =>
      `Publié le ${published} par le bureau des opérations · avis ${reference} · expire le ${expires} sauf renouvellement. Information de sécurité pour la réservation ${code}.`,
  },
};

/**
 * E-Advisory (Phase 6, M7): a caution or critical advisory sent at publication
 * to travelers with a secured trip in its regions within 60 days. The
 * advisory's own words lead; the board's per-service impact lines, SMS and
 * emergency-contact notices have no data or channel yet (ADR 0006).
 */
export function travelAdvisoryEmail({
  to,
  name,
  severity,
  headline,
  body,
  cta,
  source,
  reference,
  publishedAt,
  expiresAt,
  regionNames,
  bookingCode,
  tripName,
  startDate,
  endDate,
  travelInfoUrl,
  tripUrl,
  locale: requestedLocale,
  branding,
}: TravelAdvisoryEmailInput): EmailMessage {
  const locale = emailLocale(requestedLocale);
  const copy = COPY[locale];
  const regions =
    regionNames.length > 0 ? emailList(regionNames, locale) : copy.wholeCountry;
  const { html, text } = emailShell({
    branding,
    greeting: copy.greeting(name),
    paragraphs: [
      copy.label(copy.severity[severity]),
      headline,
      body,
      copy.source(source),
      copy.meaning(
        tripName ?? copy.customTrip,
        emailDateRange(startDate, endDate, locale),
        bookingCode,
        regions,
      ),
      copy.desk,
      ...(severity === 'CRITICAL' ? [copy.acknowledge] : []),
    ],
    closing: [copy.messages(tripUrl)],
    cta: { label: cta ?? copy.conditions, url: travelInfoUrl },
    note: copy.note(
      emailInstant(publishedAt, locale),
      reference,
      emailDate(expiresAt, locale),
      bookingCode,
    ),
  });
  return { to, subject: copy.subject(headline), html, text };
}

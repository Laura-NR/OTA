import { emailDate, emailLocale, type EmailLocale } from '../locale';
import type { EmailMessage } from '../mailer';
import type { EmailBranding } from './magic-link';
import { emailShell } from './shell';

export interface RetentionNoticeEmailInput {
  to: string;
  /** One-click [Keep my account active] link. */
  keepAliveUrl: string;
  /** Last day the account can be kept before the record is anonymized. */
  purgeAt: Date;
  branding: EmailBranding;
  /** The traveler's name for the greeting; null greets without one. */
  name?: string | null;
  locale?: string | null;
  /** The one reminder before the deadline (E-Retention, day 23 of 30). */
  reminder?: boolean;
}

interface Copy {
  subject: (agency: string, date: string, reminder: boolean) => string;
  greeting: (name: string | null) => string;
  why: string;
  when: (date: string) => string;
  removed: string;
  points: string[];
  kept: string;
  cta: string;
  extends: string;
  fallback: (url: string) => string;
  note: string;
}

const COPY: Record<EmailLocale, Copy> = {
  en: {
    subject: (agency, date, reminder) =>
      reminder
        ? `Reminder: keep your ${agency} account, or we anonymize it on ${date}`
        : `Your ${agency} account: keep it, or we anonymize it on ${date}`,
    greeting: (name) => (name ? `Hello ${name},` : 'Hello,'),
    why: 'We keep your personal data only while it is useful to you.',
    when: (date) =>
      `On ${date} we will anonymize your account unless you ask us to keep it.`,
    removed: 'If you do nothing, we remove:',
    points: [
      'your name, email address, phone number and nationality;',
      "your travel party's names, passport details and emergency contacts;",
      'the personal text in your messages and reviews.',
    ],
    kept: 'We keep, without anything that identifies you, the amounts, dates and provinces that tax law requires. US travel certifications, where they exist, are kept for five years as US rules require.',
    cta: 'Keep my account active',
    extends:
      'Keeping it extends your account for 12 months. You can ask us to delete it at any time.',
    fallback: (url) =>
      `If the button does not work, paste this link into your browser: ${url}`,
    note: 'A data-protection notice (GDPR art. 5(1)(e)), not marketing: sent once, with one reminder.',
  },
  es: {
    subject: (agency, date, reminder) =>
      reminder
        ? `Recordatorio: conserva tu cuenta de ${agency} o la anonimizaremos el ${date}`
        : `Tu cuenta de ${agency}: consérvala o la anonimizaremos el ${date}`,
    greeting: (name) => (name ? `Hola ${name}:` : 'Hola:'),
    why: 'Solo conservamos tus datos personales mientras te sean útiles.',
    when: (date) =>
      `El ${date} anonimizaremos tu cuenta, salvo que nos pidas conservarla.`,
    removed: 'Si no haces nada, eliminamos:',
    points: [
      'tu nombre, email, teléfono y nacionalidad;',
      'los nombres, datos de pasaporte y contactos de emergencia de tus acompañantes;',
      'el texto personal de tus mensajes y valoraciones.',
    ],
    kept: 'Conservamos, sin nada que te identifique, los importes, fechas y provincias que exige la ley fiscal. Las certificaciones de viaje de EE. UU., si existen, se conservan cinco años como exigen las normas de EE. UU.',
    cta: 'Conservar mi cuenta',
    extends:
      'Conservarla la amplía 12 meses. Puedes pedirnos que la borremos en cualquier momento.',
    fallback: (url) =>
      `Si el botón no funciona, pega este enlace en tu navegador: ${url}`,
    note: 'Aviso de protección de datos (RGPD art. 5.1.e), no publicidad: se envía una vez, con un recordatorio.',
  },
  fr: {
    subject: (agency, date, reminder) =>
      reminder
        ? `Rappel : conservez votre compte ${agency}, sinon nous l'anonymiserons le ${date}`
        : `Votre compte ${agency} : conservez-le, sinon nous l'anonymiserons le ${date}`,
    greeting: (name) => (name ? `Bonjour ${name},` : 'Bonjour,'),
    why: "Nous ne conservons vos données personnelles que tant qu'elles vous sont utiles.",
    when: (date) =>
      `Le ${date}, nous anonymiserons votre compte, sauf si vous nous demandez de le conserver.`,
    removed: 'Sans action de votre part, nous supprimons :',
    points: [
      'vos nom, adresse e-mail, téléphone et nationalité ;',
      "les noms, données de passeport et contacts d'urgence de vos compagnons de voyage ;",
      'le texte personnel de vos messages et avis.',
    ],
    kept: "Nous conservons, sans rien qui vous identifie, les montants, dates et provinces exigés par la loi fiscale. Les certifications de voyage américaines, le cas échéant, sont conservées cinq ans comme l'exigent les règles américaines.",
    cta: 'Conserver mon compte',
    extends:
      'Le conserver le prolonge de 12 mois. Vous pouvez nous demander de le supprimer à tout moment.',
    fallback: (url) =>
      `Si le bouton ne fonctionne pas, collez ce lien dans votre navigateur : ${url}`,
    note: 'Avis de protection des données (RGPD art. 5.1.e), et non de la publicité : envoyé une fois, avec un rappel.',
  },
};

/**
 * Spec §3.5 keep-alive notice (E-Retention): which personal details the
 * anonymization removes and what is kept for the tax office, with a one-click
 * link to keep the account for another 12 months. The same email, marked as
 * a reminder, goes out once more a week before the deadline.
 */
export function retentionNoticeEmail({
  to,
  keepAliveUrl,
  purgeAt,
  branding,
  name = null,
  locale: requestedLocale,
  reminder = false,
}: RetentionNoticeEmailInput): EmailMessage {
  const locale = emailLocale(requestedLocale);
  const copy = COPY[locale];
  const deadline = emailDate(purgeAt, locale);
  const { html, text } = emailShell({
    branding,
    greeting: copy.greeting(name),
    paragraphs: [copy.why, copy.when(deadline), copy.removed],
    points: copy.points,
    closing: [copy.kept, copy.extends],
    cta: { label: copy.cta, url: keepAliveUrl },
    note: `${copy.fallback(keepAliveUrl)} ${copy.note}`,
  });
  return {
    to,
    subject: copy.subject(branding.agencyName, deadline, reminder),
    html,
    text,
  };
}

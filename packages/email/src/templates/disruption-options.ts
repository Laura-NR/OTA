import { emailInstant, emailLocale, type EmailLocale } from '../locale';
import type { EmailMessage } from '../mailer';
import type { EmailBranding } from './magic-link';
import { emailShell } from './shell';

export type DisruptionEmailSeverity = 'MINOR' | 'MAJOR' | 'EMERGENCY';

export interface DisruptionOptionsEmailInput {
  to: string;
  name: string;
  severity: DisruptionEmailSeverity;
  /** The case's title and summary, in the desk's language. */
  title: string;
  summary: string;
  /** The options as the desk wrote them, each stating its money consequence. */
  options: readonly { key: string; title: string; detail: string }[];
  defaultOptionKey: string;
  deadline: Date;
  /** The scenario's compensation rule. */
  policy: string;
  reference: string;
  bookingCode: string;
  sentAt: Date;
  /** The trip page where the traveler chooses, behind sign-in (D4). */
  tripUrl: string;
  /** The zone the deadline is read in (the agency's: America/Havana). */
  timeZone?: string;
  locale?: string | null;
  branding: EmailBranding;
}

interface Copy {
  severity: Record<DisruptionEmailSeverity, string>;
  subject: (title: string, deadline: string) => string;
  greeting: (name: string) => string;
  label: (code: string, reference: string) => string;
  choose: (deadline: string) => string;
  silence: (deadline: string, key: string) => string;
  policy: (policy: string) => string;
  call: (phone: string) => string;
  cta: string;
  note: (code: string, reference: string, severity: string, sent: string) => string;
}

const COPY: Record<EmailLocale, Copy> = {
  en: {
    severity: { MINOR: 'minor', MAJOR: 'major', EMERGENCY: 'emergency' },
    subject: (title, deadline) =>
      `${title} · choose how you'd like to continue by ${deadline}`,
    greeting: (name) => `Hello ${name},`,
    label: (code, reference) => `${code} · case ${reference}`,
    choose: (deadline) =>
      `Here is what we can do. Please pick one option by ${deadline}:`,
    silence: (deadline, key) =>
      `If we hear nothing by ${deadline} we keep option ${key} and the desk calls you.`,
    policy: (policy) => `Compensation: ${policy}`,
    call: (phone) => `Or call the desk any time: ${phone}.`,
    cta: 'Choose in your account',
    note: (code, reference, severity, sent) =>
      `Duty-of-care message for booking ${code} · case ${reference} (${severity}). Sent ${sent}.`,
  },
  es: {
    severity: { MINOR: 'leve', MAJOR: 'grave', EMERGENCY: 'emergencia' },
    subject: (title, deadline) => `${title} · elige cómo continuar antes de ${deadline}`,
    greeting: (name) => `Hola ${name}:`,
    label: (code, reference) => `${code} · caso ${reference}`,
    choose: (deadline) =>
      `Esto es lo que podemos hacer. Elige una opción antes de ${deadline}:`,
    silence: (deadline, key) =>
      `Si no sabemos nada de ti antes de ${deadline}, mantenemos la opción ${key} y el equipo te llama.`,
    policy: (policy) => `Compensación: ${policy}`,
    call: (phone) => `O llama al equipo cuando quieras: ${phone}.`,
    cta: 'Elegir en tu cuenta',
    note: (code, reference, severity, sent) =>
      `Mensaje de deber de asistencia para la reserva ${code} · caso ${reference} (${severity}). Enviado el ${sent}.`,
  },
  fr: {
    severity: { MINOR: 'mineur', MAJOR: 'majeur', EMERGENCY: 'urgence' },
    subject: (title, deadline) =>
      `${title} · choisissez comment poursuivre avant ${deadline}`,
    greeting: (name) => `Bonjour ${name},`,
    label: (code, reference) => `${code} · dossier ${reference}`,
    choose: (deadline) =>
      `Voici ce que nous pouvons faire. Choisissez une option avant ${deadline} :`,
    silence: (deadline, key) =>
      `Sans réponse avant ${deadline}, nous gardons l'option ${key} et le bureau vous appelle.`,
    policy: (policy) => `Compensation : ${policy}`,
    call: (phone) => `Ou appelez le bureau à tout moment : ${phone}.`,
    cta: 'Choisir dans votre compte',
    note: (code, reference, severity, sent) =>
      `Message d'assistance pour la réservation ${code} · dossier ${reference} (${severity}). Envoyé le ${sent}.`,
  },
};

/**
 * E-Options (Phase 6, M8): the case's options with a deadline, sent when the
 * desk sends them. The case's own words (title, summary, options, rule) are
 * the desk's and stay in its language; the frame is in the traveler's. The
 * choice is made on the trip page behind sign-in, so the email carries no
 * answer link of its own (D4); SMS and in-app buttons wait for a provider.
 */
export function disruptionOptionsEmail({
  to,
  name,
  severity,
  title,
  summary,
  options,
  defaultOptionKey,
  deadline,
  policy,
  reference,
  bookingCode,
  sentAt,
  tripUrl,
  timeZone = 'America/Havana',
  locale: requestedLocale,
  branding,
}: DisruptionOptionsEmailInput): EmailMessage {
  const locale = emailLocale(requestedLocale);
  const copy = COPY[locale];
  const due = emailInstant(deadline, locale, timeZone);
  const { html, text } = emailShell({
    branding,
    greeting: copy.greeting(name),
    paragraphs: [copy.label(bookingCode, reference), title, summary, copy.choose(due)],
    points: options.map((option) => `${option.key} · ${option.title}: ${option.detail}`),
    closing: [
      copy.silence(due, defaultOptionKey),
      copy.policy(policy),
      ...(branding.supportPhone ? [copy.call(branding.supportPhone)] : []),
    ],
    cta: { label: copy.cta, url: tripUrl },
    note: copy.note(
      bookingCode,
      reference,
      copy.severity[severity],
      emailInstant(sentAt, locale, timeZone),
    ),
  });
  return { to, subject: copy.subject(title, due), html, text };
}

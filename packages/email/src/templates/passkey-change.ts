import type { EmailMessage } from '../mailer';
import { emailLocale } from '../locale';
import type { EmailBranding } from './magic-link';
import { emailShell } from './shell';

/**
 * `reset`: a Super Admin removed every passkey (P5); `recovery_issued`: a
 * Super Admin issued a recovery code, and `recovery_used`: it signed in
 * (`docs/schema-m9-recovery-codes.md`); the others the person did.
 */
export type PasskeyChangeKind =
  'added' | 'removed' | 'reset' | 'recovery_issued' | 'recovery_used';

export interface PasskeyChangeEmailInput {
  to: string;
  change: PasskeyChangeKind;
  /** The passkey's name, when it has one (`added` only). */
  passkeyName?: string | null;
  /** The Super Admin who reset the passkeys or issued the code. */
  actorName?: string | null;
  /** "26 October 2026, 14:05 UTC", formatted by the caller in the email's language. */
  when: string;
  /** The desk's passkey page. */
  url: string;
  locale?: string | null;
  branding: EmailBranding;
}

const COPY = {
  en: {
    subject: {
      added: (agency: string) => `A passkey was added to your ${agency} desk account`,
      removed: (agency: string) =>
        `A passkey was removed from your ${agency} desk account`,
      reset: (agency: string) => `Your ${agency} desk passkeys were reset`,
      recovery_issued: (agency: string) =>
        `A recovery code was issued for your ${agency} desk account`,
      recovery_used: (agency: string) => `Your ${agency} desk recovery code was used`,
    },
    greeting: 'Hello,',
    body: {
      added: (name: string | null, when: string) =>
        `A passkey${name ? ` named “${name}”` : ''} was added to your desk account on ${when}.`,
      removed: (_name: string | null, when: string) =>
        `A passkey was removed from your desk account on ${when}.`,
      reset: (actor: string | null, when: string) =>
        `${actor ?? 'A Super Admin'} removed every passkey from your desk account on ${when} and signed you out. Sign in with the link sent to this address and set up a new passkey.`,
      recovery_issued: (actor: string | null, when: string) =>
        `${actor ?? 'A Super Admin'} issued a one-time recovery code for your desk account on ${when}. It works once, for 15 minutes, and only to set up a new passkey. Any passkeys you had were removed and you were signed out.`,
      recovery_used: (_name: string | null, when: string) =>
        `Your recovery code was used to sign in to your desk account on ${when}. That session can only set up a new passkey.`,
    },
    check:
      'If this was not you, tell a Super Admin at once: they can reset your passkeys and sign you out everywhere.',
    cta: 'Open your passkeys',
    note: 'You receive this because the passkeys on this desk account changed.',
  },
  es: {
    subject: {
      added: (agency: string) => `Se añadió una llave de acceso a su cuenta de ${agency}`,
      removed: (agency: string) =>
        `Se quitó una llave de acceso de su cuenta de ${agency}`,
      reset: (agency: string) => `Se restablecieron sus llaves de acceso de ${agency}`,
      recovery_issued: (agency: string) =>
        `Se emitió un código de recuperación para su cuenta de ${agency}`,
      recovery_used: (agency: string) => `Se usó su código de recuperación de ${agency}`,
    },
    greeting: 'Hola:',
    body: {
      added: (name: string | null, when: string) =>
        `Se añadió una llave de acceso${name ? ` llamada «${name}»` : ''} a su cuenta de la mesa el ${when}.`,
      removed: (_name: string | null, when: string) =>
        `Se quitó una llave de acceso de su cuenta de la mesa el ${when}.`,
      reset: (actor: string | null, when: string) =>
        `${actor ?? 'Un Super Admin'} quitó todas las llaves de acceso de su cuenta de la mesa el ${when} y cerró sus sesiones. Inicie sesión con el enlace enviado a esta dirección y configure una nueva llave.`,
      recovery_issued: (actor: string | null, when: string) =>
        `${actor ?? 'Un Super Admin'} emitió un código de recuperación de un solo uso para su cuenta de la mesa el ${when}. Funciona una vez, durante 15 minutos, y solo para configurar una nueva llave de acceso. Se quitaron las llaves que tuviera y se cerraron sus sesiones.`,
      recovery_used: (_name: string | null, when: string) =>
        `Su código de recuperación se usó para iniciar sesión en su cuenta de la mesa el ${when}. Esa sesión solo puede configurar una nueva llave de acceso.`,
    },
    check:
      'Si no fue usted, avise enseguida a un Super Admin: puede restablecer sus llaves y cerrar todas sus sesiones.',
    cta: 'Abrir sus llaves de acceso',
    note: 'Recibe este correo porque cambiaron las llaves de acceso de esta cuenta de la mesa.',
  },
  fr: {
    subject: {
      added: (agency: string) => `Une clé d'accès a été ajoutée à votre compte ${agency}`,
      removed: (agency: string) =>
        `Une clé d'accès a été retirée de votre compte ${agency}`,
      reset: (agency: string) => `Vos clés d'accès ${agency} ont été réinitialisées`,
      recovery_issued: (agency: string) =>
        `Un code de récupération a été émis pour votre compte ${agency}`,
      recovery_used: (agency: string) =>
        `Votre code de récupération ${agency} a été utilisé`,
    },
    greeting: 'Bonjour,',
    body: {
      added: (name: string | null, when: string) =>
        `Une clé d'accès${name ? ` nommée « ${name} »` : ''} a été ajoutée à votre compte du bureau le ${when}.`,
      removed: (_name: string | null, when: string) =>
        `Une clé d'accès a été retirée de votre compte du bureau le ${when}.`,
      reset: (actor: string | null, when: string) =>
        `${actor ?? 'Un Super Admin'} a retiré toutes les clés d'accès de votre compte du bureau le ${when} et a fermé vos sessions. Connectez-vous avec le lien envoyé à cette adresse et configurez une nouvelle clé.`,
      recovery_issued: (actor: string | null, when: string) =>
        `${actor ?? 'Un Super Admin'} a émis un code de récupération à usage unique pour votre compte du bureau le ${when}. Il fonctionne une fois, pendant 15 minutes, et seulement pour configurer une nouvelle clé d'accès. Vos clés éventuelles ont été retirées et vos sessions fermées.`,
      recovery_used: (_name: string | null, when: string) =>
        `Votre code de récupération a servi à vous connecter à votre compte du bureau le ${when}. Cette session ne peut que configurer une nouvelle clé d'accès.`,
    },
    check:
      "Si ce n'était pas vous, prévenez tout de suite un Super Admin : il peut réinitialiser vos clés et fermer toutes vos sessions.",
    cta: "Ouvrir vos clés d'accès",
    note: "Vous recevez ce message parce que les clés d'accès de ce compte du bureau ont changé.",
  },
} as const;

/**
 * `docs/schema-m9-passkeys.md` P4/P5 and `docs/schema-m9-recovery-codes.md`:
 * tell a staff member their passkeys or their way back in changed.
 */
export function passkeyChangeEmail({
  to,
  change,
  passkeyName,
  actorName,
  when,
  url,
  locale,
  branding,
}: PasskeyChangeEmailInput): EmailMessage {
  const copy = COPY[emailLocale(locale)];
  const subject = copy.subject[change](branding.agencyName);
  const body =
    change === 'reset' || change === 'recovery_issued'
      ? copy.body[change](actorName ?? null, when)
      : copy.body[change](passkeyName ?? null, when);
  const { html, text } = emailShell({
    branding,
    greeting: copy.greeting,
    paragraphs: [body, copy.check],
    cta: { label: copy.cta, url },
    note: copy.note,
  });
  return { to, subject, html, text };
}

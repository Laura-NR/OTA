import type { EmailMessage } from '../mailer';
import { emailInstant, emailLocale } from '../locale';
import type { EmailBranding } from './magic-link';
import { emailShell } from './shell';

/** How the session was created, as the auth package records it. */
export type NewDeviceSignInMethod =
  'passkey' | 'magic_link' | 'recovery_code' | 'password' | 'oauth' | 'other';

export interface NewDeviceSignInEmailInput {
  to: string;
  /** When the sign-in happened; shown in UTC with its zone. */
  at: Date;
  /** "Firefox · Windows", from the domain's `deviceLabel`. */
  device: string;
  ipAddress: string | null;
  signInMethod: string | null;
  /** The desk's sign-in page. */
  url: string;
  locale?: string | null;
  branding: EmailBranding;
}

const COPY = {
  en: {
    subject: (agency: string) => `New sign-in to your ${agency} desk account`,
    greeting: 'Hello,',
    body: (when: string) =>
      `Your desk account was signed in to on ${when} from a device it had not seen before.`,
    device: (value: string) => `Device: ${value}`,
    ip: (value: string) => `IP address: ${value}`,
    method: (value: string) => `Signed in with: ${value}`,
    methods: {
      passkey: 'a passkey',
      magic_link: 'a sign-in link',
      recovery_code: 'a recovery code',
      password: 'a password',
      oauth: 'a Google account',
      other: 'another method',
    },
    unknown: 'not known',
    check:
      'If this was you, there is nothing to do. If it was not, tell a Super Admin now: they can end your sessions and reset your passkeys.',
    cta: 'Open the desk',
    note: 'You receive this for every sign-in to this desk account from a new device.',
  },
  es: {
    subject: (agency: string) => `Nuevo acceso a su cuenta de la mesa de ${agency}`,
    greeting: 'Hola:',
    body: (when: string) =>
      `Se inició sesión en su cuenta de la mesa el ${when} desde un dispositivo que no se había visto antes.`,
    device: (value: string) => `Dispositivo: ${value}`,
    ip: (value: string) => `Dirección IP: ${value}`,
    method: (value: string) => `Acceso con: ${value}`,
    methods: {
      passkey: 'una llave de acceso',
      magic_link: 'un enlace de acceso',
      recovery_code: 'un código de recuperación',
      password: 'una contraseña',
      oauth: 'una cuenta de Google',
      other: 'otro método',
    },
    unknown: 'desconocida',
    check:
      'Si fue usted, no tiene que hacer nada. Si no, avise ahora a un Super Admin: puede cerrar sus sesiones y restablecer sus llaves de acceso.',
    cta: 'Abrir la mesa',
    note: 'Recibe este correo cada vez que se inicia sesión en esta cuenta de la mesa desde un dispositivo nuevo.',
  },
  fr: {
    subject: (agency: string) => `Nouvelle connexion à votre compte du bureau ${agency}`,
    greeting: 'Bonjour,',
    body: (when: string) =>
      `Une connexion à votre compte du bureau a eu lieu le ${when} depuis un appareil jamais vu auparavant.`,
    device: (value: string) => `Appareil : ${value}`,
    ip: (value: string) => `Adresse IP : ${value}`,
    method: (value: string) => `Connexion avec : ${value}`,
    methods: {
      passkey: "une clé d'accès",
      magic_link: 'un lien de connexion',
      recovery_code: 'un code de récupération',
      password: 'un mot de passe',
      oauth: 'un compte Google',
      other: 'une autre méthode',
    },
    unknown: 'inconnue',
    check:
      "Si c'était vous, il n'y a rien à faire. Sinon, prévenez tout de suite un Super Admin : il peut fermer vos sessions et réinitialiser vos clés d'accès.",
    cta: 'Ouvrir le bureau',
    note: 'Vous recevez ce message à chaque connexion à ce compte du bureau depuis un nouvel appareil.',
  },
} as const;

/**
 * `docs/schema-m9-new-device-email.md` N3: tell a staff member their desk
 * account was signed in to from a device not seen before.
 */
export function newDeviceSignInEmail({
  to,
  at,
  device,
  ipAddress,
  signInMethod,
  url,
  locale,
  branding,
}: NewDeviceSignInEmailInput): EmailMessage {
  const language = emailLocale(locale);
  const copy = COPY[language];
  const method =
    copy.methods[(signInMethod ?? 'other') as NewDeviceSignInMethod] ??
    copy.methods.other;
  const { html, text } = emailShell({
    branding,
    greeting: copy.greeting,
    paragraphs: [copy.body(emailInstant(at, language))],
    points: [
      copy.device(device),
      copy.ip(ipAddress || copy.unknown),
      copy.method(method),
    ],
    closing: [copy.check],
    cta: { label: copy.cta, url },
    note: copy.note,
  });
  return { to, subject: copy.subject(branding.agencyName), html, text };
}

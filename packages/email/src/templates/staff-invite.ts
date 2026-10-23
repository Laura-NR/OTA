import type { EmailMessage } from '../mailer';
import { emailLocale } from '../locale';
import type { EmailBranding } from './magic-link';
import { emailShell } from './shell';

export interface StaffInviteEmailInput {
  to: string;
  /** The role as the desk names it ("Operations Admin"), in the email's language. */
  roleLabel: string;
  inviterName: string | null;
  /** The acceptance page with the single-use token. */
  url: string;
  /** "30 October 2026", formatted by the caller in the email's language. */
  expiresOn: string;
  locale?: string | null;
  branding: EmailBranding;
}

const COPY = {
  en: {
    subject: (agency: string) => `You are invited to the ${agency} desk`,
    greeting: 'Hello,',
    body: (inviter: string | null, role: string, agency: string) =>
      `${inviter ?? 'A Super Admin'} invited you to the ${agency} operations desk as ${role}.`,
    how: (email: string) =>
      `Open the link and sign in with this address (${email}); the desk sends you a one-time sign-in link, and your role applies once you accept.`,
    expires: (date: string) => `The invitation works until ${date} and only once.`,
    cta: 'Accept the invitation',
    note: 'You receive this because a Super Admin invited this address. If you did not expect it, ignore it.',
  },
  es: {
    subject: (agency: string) => `Invitación a la mesa de ${agency}`,
    greeting: 'Hola:',
    body: (inviter: string | null, role: string, agency: string) =>
      `${inviter ?? 'Un Super Admin'} le invitó a la mesa de operaciones de ${agency} como ${role}.`,
    how: (email: string) =>
      `Abra el enlace e inicie sesión con esta dirección (${email}); la mesa le envía un enlace de acceso de un solo uso y su rol se aplica al aceptar.`,
    expires: (date: string) => `La invitación es válida hasta el ${date} y una sola vez.`,
    cta: 'Aceptar la invitación',
    note: 'Recibe este correo porque un Super Admin invitó esta dirección. Si no lo esperaba, ignórelo.',
  },
  fr: {
    subject: (agency: string) => `Invitation au bureau de ${agency}`,
    greeting: 'Bonjour,',
    body: (inviter: string | null, role: string, agency: string) =>
      `${inviter ?? 'Un Super Admin'} vous invite au bureau des opérations de ${agency} en tant que ${role}.`,
    how: (email: string) =>
      `Ouvrez le lien et connectez-vous avec cette adresse (${email}) ; le bureau vous envoie un lien de connexion à usage unique, et votre rôle s'applique à l'acceptation.`,
    expires: (date: string) =>
      `L'invitation est valable jusqu'au ${date}, une seule fois.`,
    cta: "Accepter l'invitation",
    note: "Vous recevez ce message parce qu'un Super Admin a invité cette adresse. Si vous ne l'attendiez pas, ignorez-le.",
  },
} as const;

/** M9 D4: an invitation to join the operations desk, or to become a Super Admin. */
export function staffInviteEmail({
  to,
  roleLabel,
  inviterName,
  url,
  expiresOn,
  locale,
  branding,
}: StaffInviteEmailInput): EmailMessage {
  const copy = COPY[emailLocale(locale)];
  const { html, text } = emailShell({
    branding,
    greeting: copy.greeting,
    paragraphs: [
      copy.body(inviterName, roleLabel, branding.agencyName),
      copy.how(to),
      copy.expires(expiresOn),
    ],
    cta: { label: copy.cta, url },
    note: copy.note,
  });
  return { to, subject: copy.subject(branding.agencyName), html, text };
}

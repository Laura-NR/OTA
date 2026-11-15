import type { EmailMessage } from '../mailer';
import { emailLocale } from '../locale';
import type { EmailBranding } from './magic-link';
import { emailShell } from './shell';

export interface WorkerAppInviteEmailInput {
  to: string;
  /** The supplier profile's phone, the number the worker signs in with. */
  phone: string;
  /** The download page (`WORKER_APP_PUBLIC_URL`). */
  url: string;
  locale?: string | null;
  branding: EmailBranding;
}

const COPY = {
  en: {
    subject: (agency: string) => `Welcome to ${agency}: install the partner app`,
    greeting: 'Hello,',
    body: (agency: string) =>
      `Your application is approved: you are now a ${agency} partner. Offers, your calendar and your jobs arrive in the partner app.`,
    install:
      'Open the link on your Android phone. The page shows how to install the app and the certificate that proves it comes from us.',
    signIn: (phone: string) =>
      `Then sign in with your phone number (${phone}). If the code does not arrive, call the desk and they will give you one.`,
    call: (phone: string) => `The desk: ${phone}.`,
    cta: 'Download the app',
    note: 'You receive this because the agency approved your partner application.',
  },
  es: {
    subject: (agency: string) =>
      `Bienvenido a ${agency}: instala la app de colaboradores`,
    greeting: 'Hola:',
    body: (agency: string) =>
      `Tu solicitud está aprobada: ya eres colaborador de ${agency}. Las ofertas, tu calendario y tus trabajos llegan a la app de colaboradores.`,
    install:
      'Abre el enlace en tu teléfono Android. La página explica cómo instalar la app y muestra el certificado que prueba que viene de nosotros.',
    signIn: (phone: string) =>
      `Después entra con tu número de teléfono (${phone}). Si el código no llega, llama a la central y te lo dan.`,
    call: (phone: string) => `La central: ${phone}.`,
    cta: 'Descargar la app',
    note: 'Recibes este correo porque la agencia aprobó tu solicitud de colaborador.',
  },
  fr: {
    subject: (agency: string) =>
      `Bienvenue chez ${agency} : installez l'application partenaires`,
    greeting: 'Bonjour,',
    body: (agency: string) =>
      `Votre candidature est acceptée : vous êtes désormais partenaire de ${agency}. Les offres, votre calendrier et vos missions arrivent dans l'application partenaires.`,
    install:
      "Ouvrez le lien sur votre téléphone Android. La page explique comment installer l'application et affiche le certificat qui prouve qu'elle vient de nous.",
    signIn: (phone: string) =>
      `Connectez-vous ensuite avec votre numéro (${phone}). Si le code n'arrive pas, appelez le bureau, qui vous le donnera.`,
    call: (phone: string) => `Le bureau : ${phone}.`,
    cta: "Télécharger l'application",
    note: "Vous recevez ce message parce que l'agence a accepté votre candidature de partenaire.",
  },
} as const;

/** U6a: a supplier is approved; the link to the worker app's download page. */
export function workerAppInviteEmail({
  to,
  phone,
  url,
  locale,
  branding,
}: WorkerAppInviteEmailInput): EmailMessage {
  const copy = COPY[emailLocale(locale)];
  const { html, text } = emailShell({
    branding,
    greeting: copy.greeting,
    paragraphs: [
      copy.body(branding.agencyName),
      copy.install,
      copy.signIn(phone),
      ...(branding.supportPhone ? [copy.call(branding.supportPhone)] : []),
    ],
    cta: { label: copy.cta, url },
    note: copy.note,
  });
  return { to, subject: copy.subject(branding.agencyName), html, text };
}

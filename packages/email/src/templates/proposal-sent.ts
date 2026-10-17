import { emailDate, emailLocale, emailMoney, type EmailLocale } from '../locale';
import type { EmailAttachment, EmailMessage } from '../mailer';
import type { EmailBranding } from './magic-link';

export interface ProposalSentEmailInput {
  to: string;
  name: string;
  reference: string;
  summary: string;
  total: number;
  currency: string;
  validUntil: Date;
  portalUrl: string;
  locale?: string | null;
  branding: EmailBranding;
  /** The D-Proposal PDF of this version, when it could be rendered. */
  pdf?: EmailAttachment | null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

interface Copy {
  subject: (reference: string) => string;
  greeting: (name: string) => string;
  lede: string;
  total: (amount: string, date: string) => string;
  cta: string;
  note: string;
  attached: string;
}

const COPY: Record<EmailLocale, Copy> = {
  en: {
    subject: (reference) => `Your custom-trip proposal · ${reference}`,
    greeting: (name) => `Hello ${name},`,
    lede: 'Your day-by-day proposal is ready.',
    total: (amount, date) =>
      `The proposal total is ${amount}. Prices are held until ${date}.`,
    cta: 'Review your proposal',
    note: 'Review it online and accept it when it feels right. Nothing is charged by accepting; the desk confirms each provider first.',
    attached: 'The proposal is attached as a PDF to keep or print.',
  },
  es: {
    subject: (reference) => `Tu propuesta de viaje a medida · ${reference}`,
    greeting: (name) => `Hola ${name}:`,
    lede: 'Tu propuesta día a día está lista.',
    total: (amount, date) =>
      `El total de la propuesta es ${amount}. Los precios se mantienen hasta el ${date}.`,
    cta: 'Ver tu propuesta',
    note: 'Revísala en línea y acéptala cuando quieras. Aceptarla no cobra nada; primero confirmamos a cada proveedor.',
    attached: 'Adjuntamos la propuesta en PDF para guardarla o imprimirla.',
  },
  fr: {
    subject: (reference) => `Votre proposition de voyage sur mesure · ${reference}`,
    greeting: (name) => `Bonjour ${name},`,
    lede: 'Votre proposition jour par jour est prête.',
    total: (amount, date) =>
      `Le total de la proposition est de ${amount}. Les prix sont garantis jusqu'au ${date}.`,
    cta: 'Voir votre proposition',
    note: "Consultez-la en ligne et acceptez-la quand vous le souhaitez. L'accepter ne débite rien ; le bureau confirme d'abord chaque prestataire.",
    attached: 'La proposition est jointe en PDF, à conserver ou à imprimer.',
  },
};

/**
 * M5: the email that tells a traveler a priced proposal is ready. It links to
 * the signed-in proposal page, where it is accepted, and carries the version's
 * D-Proposal PDF when one was rendered.
 */
export function proposalSentEmail({
  to,
  name,
  reference,
  summary,
  total,
  currency,
  validUntil,
  portalUrl,
  locale: requestedLocale,
  branding,
  pdf,
}: ProposalSentEmailInput): EmailMessage {
  const locale = emailLocale(requestedLocale);
  const copy = COPY[locale];
  const safeUrl = escapeHtml(portalUrl);
  const amount = emailMoney(total, currency, locale);
  const date = emailDate(validUntil, locale);

  const html = `<!doctype html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937;">
  <h1 style="color: ${branding.primaryColor}; font-size: 20px;">${escapeHtml(branding.agencyName)}</h1>
  <p>${escapeHtml(copy.greeting(name))}</p>
  <p>${escapeHtml(copy.lede)}</p>
  <blockquote style="border-left:3px solid ${branding.primaryColor};margin:12px 0;padding:8px 12px;background:#f9fafb;">
    ${escapeHtml(summary)}
  </blockquote>
  <p>${escapeHtml(copy.total(amount, date))}</p>${pdf ? `\n  <p>${escapeHtml(copy.attached)}</p>` : ''}
  <p>
    <a href="${safeUrl}"
       style="display:inline-block;background:${branding.primaryColor};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">
      ${escapeHtml(copy.cta)}
    </a>
  </p>
  <p style="color:#6b7280;font-size:12px;">${escapeHtml(copy.note)}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;" />
  <p style="color:#6b7280;font-size:11px;">
    ${escapeHtml(branding.agencyName)} · MINTUR License ${escapeHtml(branding.licenseNumber)}
    ${branding.supportEmail ? ` · ${escapeHtml(branding.supportEmail)}` : ''}
    <br/>${escapeHtml(reference)}
  </p>
</body>
</html>`;

  const text = `${branding.agencyName}\n\n${copy.greeting(name)}\n${copy.lede}\n\n${summary}\n\n${copy.total(amount, date)}${pdf ? `\n${copy.attached}` : ''}\n\n${copy.cta}: ${portalUrl}\n\n${copy.note}\nMINTUR License ${branding.licenseNumber}`;

  return {
    to,
    subject: copy.subject(reference),
    html,
    text,
    ...(pdf ? { attachments: [pdf] } : {}),
  };
}

import { emailDate, emailList, emailLocale, type EmailLocale } from '../locale';
import type { EmailMessage } from '../mailer';
import type { EmailBranding } from './magic-link';

export interface OfacReminderEmailInput {
  to: string;
  name: string;
  bookingCode: string;
  startDate: Date;
  /** The US travelers still without a certification, by name. */
  travelers: string[];
  portalUrl: string;
  locale?: string | null;
  branding: EmailBranding;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

interface Copy {
  subject: (code: string) => string;
  greeting: (name: string) => string;
  body: (code: string, date: string, travelers: string) => string;
  cta: string;
  note: string;
}

const COPY: Record<EmailLocale, Copy> = {
  en: {
    subject: (code) => `Your OFAC certification is missing · ${code}`,
    greeting: (name) => `Hello ${name},`,
    body: (code, date, travelers) =>
      `US law requires each traveler on a US passport to certify their travel category (31 CFR § 515.561). For booking ${code}, departing ${date}, the certification is still missing for ${travelers}. It takes about two minutes and is signed online. Until we have it we cannot issue the vouchers or the driver's work order.`,
    cta: 'Sign the certification',
    note: "The certification is kept for five years, separate from the traveler's profile. If you have just signed it, you can ignore this email.",
  },
  es: {
    subject: (code) => `Falta tu certificación OFAC para emitir los vouchers · ${code}`,
    greeting: (name) => `Hola ${name}:`,
    body: (code, date, travelers) =>
      `La ley de EE. UU. exige que cada viajero con pasaporte estadounidense certifique la categoría de su viaje (31 CFR § 515.561). Para la reserva ${code}, con salida el ${date}, aún falta la certificación de ${travelers}. Es un formulario de dos minutos que se firma en línea. Hasta que lo tengamos no podemos emitir los vouchers ni la orden de trabajo del chofer.`,
    cta: 'Firmar la certificación',
    note: 'La certificación se conserva cinco años, separada del perfil del viajero. Si acabas de firmarla, ignora este correo.',
  },
  fr: {
    subject: (code) => `Votre certification OFAC manque pour la réservation ${code}`,
    greeting: (name) => `Bonjour ${name},`,
    body: (code, date, travelers) =>
      `La loi américaine exige que chaque voyageur titulaire d'un passeport américain certifie la catégorie de son voyage (31 CFR § 515.561). Pour la réservation ${code}, départ le ${date}, la certification manque encore pour ${travelers}. Le formulaire prend deux minutes et se signe en ligne. Sans lui, nous ne pouvons pas émettre les bons ni l'ordre de travail du chauffeur.`,
    cta: 'Signer la certification',
    note: 'La certification est conservée cinq ans, séparément du profil du voyageur. Si vous venez de la signer, ignorez cet e-mail.',
  },
};

/**
 * The E-OFAC email (Phase 6): the certification reminder the desk sends from
 * A-Customers. It names the travelers still missing and links to the booking
 * in the account, where the certification is signed.
 */
export function ofacReminderEmail({
  to,
  name,
  bookingCode,
  startDate,
  travelers,
  portalUrl,
  locale: requestedLocale,
  branding,
}: OfacReminderEmailInput): EmailMessage {
  const locale = emailLocale(requestedLocale);
  const copy = COPY[locale];
  const safeUrl = escapeHtml(portalUrl);
  const date = emailDate(startDate, locale);
  const missing = emailList(travelers, locale);

  const html = `<!doctype html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937;">
  <h1 style="color: ${branding.primaryColor}; font-size: 20px;">${escapeHtml(branding.agencyName)}</h1>
  <p>${escapeHtml(copy.greeting(name))}</p>
  <p>${escapeHtml(copy.body(bookingCode, date, missing))}</p>
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
    <br/>${escapeHtml(bookingCode)}
  </p>
</body>
</html>`;

  const text = `${branding.agencyName}\n\n${copy.greeting(name)}\n${copy.body(bookingCode, date, missing)}\n\n${copy.cta}: ${portalUrl}\n\n${copy.note}\nMINTUR License ${branding.licenseNumber}`;

  return {
    to,
    subject: copy.subject(bookingCode),
    html,
    text,
  };
}

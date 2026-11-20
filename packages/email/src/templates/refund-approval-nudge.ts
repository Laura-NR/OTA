import type { EmailMessage } from '../mailer';
import { emailList, emailLocale, emailMoney } from '../locale';
import type { EmailBranding } from './magic-link';
import { emailShell } from './shell';

export interface RefundApprovalNudgeEmailInput {
  to: string;
  /** Who sent the nudge. */
  nudgerName: string;
  bookingCode: string;
  amount: number | string;
  currency: string;
  /** A refund reason (`TRAVELER_CANCELLATION`, `GOODWILL`, …). */
  reason: string;
  /** Approvals already given, by name. */
  approvedBy: readonly string[];
  /** Above the dual limit: only a Super Admin's approval completes it. */
  superAdmin: boolean;
  /** The desk's refund queue. */
  url: string;
  locale?: string | null;
  branding: EmailBranding;
}

const COPY = {
  en: {
    subject: (code: string) => `A refund on ${code} is waiting for your approval`,
    greeting: 'Hello,',
    body: (name: string, amount: string, code: string) =>
      `${name} asks you to decide on a refund of ${amount} on booking ${code}. It goes out the moment the last approval is in.`,
    reason: (value: string) => `Reason: ${value}`,
    approvedBy: (names: string) => `Already approved by ${names}`,
    superAdmin: 'It is above the dual limit, so it needs a Super Admin.',
    check: 'Approve or reject it in the refund queue, on the desk or in Ops Lite.',
    cta: 'Open the refund queue',
    note: 'Every approver who has not voted receives this; the first decision that completes the refund closes it.',
    reasons: {
      TRAVELER_CANCELLATION: 'Traveler cancellation',
      HOST_CANCELLATION: 'Host cancellation',
      FORCE_MAJEURE: 'Force majeure',
      GOODWILL: 'Goodwill',
      PRICE_CORRECTION: 'Price correction',
    },
  },
  es: {
    subject: (code: string) => `Un reembolso de ${code} espera su aprobación`,
    greeting: 'Hola:',
    body: (name: string, amount: string, code: string) =>
      `${name} le pide decidir un reembolso de ${amount} en la reserva ${code}. Sale en cuanto llega la última aprobación.`,
    reason: (value: string) => `Motivo: ${value}`,
    approvedBy: (names: string) => `Ya aprobado por ${names}`,
    superAdmin: 'Supera el límite doble, así que necesita a un Super Admin.',
    check: 'Apruébelo o recházelo en la cola de reembolsos, en la mesa o en Ops Lite.',
    cta: 'Abrir la cola de reembolsos',
    note: 'Lo reciben todos los aprobadores que aún no han votado; la primera decisión que completa el reembolso lo cierra.',
    reasons: {
      TRAVELER_CANCELLATION: 'Cancelación del viajero',
      HOST_CANCELLATION: 'Cancelación del anfitrión',
      FORCE_MAJEURE: 'Fuerza mayor',
      GOODWILL: 'Gesto comercial',
      PRICE_CORRECTION: 'Corrección de precio',
    },
  },
  fr: {
    subject: (code: string) => `Un remboursement sur ${code} attend votre approbation`,
    greeting: 'Bonjour,',
    body: (name: string, amount: string, code: string) =>
      `${name} vous demande de statuer sur un remboursement de ${amount} sur la réservation ${code}. Il part dès que la dernière approbation est donnée.`,
    reason: (value: string) => `Motif : ${value}`,
    approvedBy: (names: string) => `Déjà approuvé par ${names}`,
    superAdmin: 'Il dépasse le plafond double : il faut un Super Admin.',
    check:
      'Approuvez-le ou refusez-le dans la file des remboursements, au bureau ou dans Ops Lite.',
    cta: 'Ouvrir la file des remboursements',
    note: "Chaque approbateur qui n'a pas voté reçoit ce message ; la première décision qui complète le remboursement le clôt.",
    reasons: {
      TRAVELER_CANCELLATION: 'Annulation du voyageur',
      HOST_CANCELLATION: "Annulation de l'hôte",
      FORCE_MAJEURE: 'Force majeure',
      GOODWILL: 'Geste commercial',
      PRICE_CORRECTION: 'Correction de prix',
    },
  },
} as const;

/**
 * AL-Alerts' "Nudge": ask the approvers who have not voted to decide a
 * pending refund. Email stands in for the design's push and SMS, which the
 * platform does not have.
 */
export function refundApprovalNudgeEmail({
  to,
  nudgerName,
  bookingCode,
  amount,
  currency,
  reason,
  approvedBy,
  superAdmin,
  url,
  locale,
  branding,
}: RefundApprovalNudgeEmailInput): EmailMessage {
  const language = emailLocale(locale);
  const copy = COPY[language];
  const reasonLabel = (copy.reasons as Record<string, string>)[reason] ?? reason;
  const { html, text } = emailShell({
    branding,
    greeting: copy.greeting,
    paragraphs: [
      copy.body(nudgerName, emailMoney(amount, currency, language), bookingCode),
    ],
    points: [
      copy.reason(reasonLabel),
      ...(approvedBy.length > 0
        ? [copy.approvedBy(emailList(approvedBy, language))]
        : []),
      ...(superAdmin ? [copy.superAdmin] : []),
    ],
    closing: [copy.check],
    cta: { label: copy.cta, url },
    note: copy.note,
  });
  return { to, subject: copy.subject(bookingCode), html, text };
}

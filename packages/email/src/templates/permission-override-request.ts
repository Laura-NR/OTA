import type { EmailMessage } from '../mailer';
import { emailLocale } from '../locale';
import type { EmailBranding } from './magic-link';
import { emailShell } from './shell';

export interface PermissionOverrideRequestEmailInput {
  to: string;
  requesterName: string;
  /** A permission-matrix row key (`payments`, `catalog`, …). */
  capability: string;
  reason: string;
  /** How long the override lasts once approved. */
  expiryHours: number;
  /** Settings › Permissions on the desk. */
  url: string;
  locale?: string | null;
  branding: EmailBranding;
}

const COPY = {
  en: {
    subject: (name: string) => `${name} asks for a permission override`,
    greeting: 'Hello,',
    body: (name: string, row: string) =>
      `${name} asks to act on "${row}" beyond their role on the desk.`,
    reason: (value: string) => `Reason: ${value}`,
    expiry: (hours: number) => `If you approve, it ends ${hours} h after approval.`,
    check:
      'Approve or decline it on Settings › Permissions. A request no one answers lapses after 24 hours.',
    cta: 'Open Settings › Permissions',
    note: 'Every Super Admin receives this; the first to decide closes the request.',
    rows: {
      bookings: 'Bookings and state transitions',
      dispatch: 'Dispatch and re-dispatch',
      suppliers: 'Supplier compliance',
      advisories: 'Travel advisories',
      disruptions: 'Disruption cases',
      payments: 'Payments, proofs and refunds',
      catalog: 'Packages, catalog and imports',
      customers: 'Customers and retention',
    },
  },
  es: {
    subject: (name: string) => `${name} pide una excepción de permisos`,
    greeting: 'Hola:',
    body: (name: string, row: string) =>
      `${name} pide actuar en «${row}» más allá de su rol en la mesa.`,
    reason: (value: string) => `Motivo: ${value}`,
    expiry: (hours: number) => `Si la aprueba, termina ${hours} h después de aprobarla.`,
    check:
      'Apruébela o recházela en Ajustes › Permisos. Una solicitud sin respuesta caduca a las 24 horas.',
    cta: 'Abrir Ajustes › Permisos',
    note: 'Todos los Super Admin reciben este correo; el primero que decide cierra la solicitud.',
    rows: {
      bookings: 'Reservas y cambios de estado',
      dispatch: 'Asignación y reasignación',
      suppliers: 'Cumplimiento de proveedores',
      advisories: 'Avisos de viaje',
      disruptions: 'Casos de incidencia',
      payments: 'Pagos, comprobantes y reembolsos',
      catalog: 'Paquetes, catálogo e importaciones',
      customers: 'Clientes y conservación de datos',
    },
  },
  fr: {
    subject: (name: string) => `${name} demande une dérogation de permissions`,
    greeting: 'Bonjour,',
    body: (name: string, row: string) =>
      `${name} demande à agir sur « ${row} » au-delà de son rôle au bureau.`,
    reason: (value: string) => `Motif : ${value}`,
    expiry: (hours: number) =>
      `Si vous l'approuvez, elle prend fin ${hours} h après l'approbation.`,
    check:
      "Approuvez-la ou refusez-la dans Paramètres › Permissions. Une demande sans réponse expire après 24 heures.",
    cta: 'Ouvrir Paramètres › Permissions',
    note: 'Chaque Super Admin reçoit ce message ; le premier qui décide clôt la demande.',
    rows: {
      bookings: 'Réservations et changements de statut',
      dispatch: 'Affectation et réaffectation',
      suppliers: 'Conformité des prestataires',
      advisories: 'Avis aux voyageurs',
      disruptions: 'Dossiers de perturbation',
      payments: 'Paiements, justificatifs et remboursements',
      catalog: 'Forfaits, catalogue et imports',
      customers: 'Clients et conservation',
    },
  },
} as const;

/**
 * `docs/schema-m9-permission-overrides.md` O8: tell a Super Admin a staff
 * member asks to override one permission-matrix row.
 */
export function permissionOverrideRequestEmail({
  to,
  requesterName,
  capability,
  reason,
  expiryHours,
  url,
  locale,
  branding,
}: PermissionOverrideRequestEmailInput): EmailMessage {
  const language = emailLocale(locale);
  const copy = COPY[language];
  const row = (copy.rows as Record<string, string>)[capability] ?? capability;
  const { html, text } = emailShell({
    branding,
    greeting: copy.greeting,
    paragraphs: [copy.body(requesterName, row)],
    points: [copy.reason(reason), copy.expiry(expiryHours)],
    closing: [copy.check],
    cta: { label: copy.cta, url },
    note: copy.note,
  });
  return { to, subject: copy.subject(requesterName), html, text };
}

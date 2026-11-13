import type { DocumentBranding } from './branding';
import { escapeHtml, page } from './templates';

/**
 * W-Earnings E5 (`docs/schema-w-earnings.md`): the receipt for one payment to
 * a worker. The office prints it for the worker to sign and keeps the signed
 * paper; the worker keeps this copy. Spanish, as the worker app is (ADR 0007).
 */
export interface PayoutReceiptModel {
  /** A short reference printed on the receipt, from the payment's id. */
  reference: string;
  workerName: string;
  workerPhone: string | null;
  /** The worker's RTN licence number. */
  licenseNumber: string;
  method: 'CASH_OFFICE' | 'BANK_TRANSFER';
  /** Where cash is collected, from the tenant manifest. */
  office: string | null;
  /** `YYYY-MM-DD`. */
  paidAt: string;
  currency: string;
  /** Decimal string, the jobs' payouts summed. */
  amount: string;
  jobs: {
    /** `YYYY-MM-DD`, in Havana. */
    endedOn: string;
    bookingCode: string;
    serviceType: string;
    province: string | null;
    amount: string;
  }[];
}

const SERVICE_LABELS: Record<string, string> = {
  GUIDE: 'Guía',
  TRANSPORTATION: 'Traslado',
  ACCOMMODATION: 'Alojamiento',
  EXPERIENCE: 'Experiencia',
};

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** "10 de octubre de 2026". */
function longDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return `${date} de ${MONTHS[month - 1]} de ${year}`;
}

function money(amount: string, currency: string): string {
  return `${escapeHtml(amount)} ${escapeHtml(currency)}`;
}

export function renderPayoutReceiptHtml(
  model: PayoutReceiptModel,
  branding: DocumentBranding,
): string {
  const method =
    model.method === 'CASH_OFFICE'
      ? `Efectivo${model.office ? ` · ${escapeHtml(model.office)}` : ''}`
      : 'Transferencia bancaria';
  const rows = model.jobs
    .map(
      (job) => `<tr>
  <td>${escapeHtml(job.endedOn)}</td>
  <td>${escapeHtml(job.bookingCode)}</td>
  <td>${escapeHtml(SERVICE_LABELS[job.serviceType] ?? job.serviceType)}${
    job.province ? ` · ${escapeHtml(job.province)}` : ''
  }</td>
  <td class="amount">${money(job.amount, model.currency)}</td>
</tr>`,
    )
    .join('');

  const body = `
<h2>Recibo de pago · ${escapeHtml(model.reference)}</h2>
<p><strong>Colaborador:</strong> ${escapeHtml(model.workerName)}${
    model.workerPhone ? ` · ${escapeHtml(model.workerPhone)}` : ''
  }<br />
<strong>Licencia RTN:</strong> ${escapeHtml(model.licenseNumber)}<br />
<strong>Fecha de pago:</strong> ${escapeHtml(longDay(model.paidAt))}<br />
<strong>Forma de pago:</strong> ${method}</p>
<table>
  <thead><tr><th>Terminado</th><th>Reserva</th><th>Servicio</th><th class="amount">Importe</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr class="total"><td colspan="3">Total (${model.jobs.length} ${
    model.jobs.length === 1 ? 'trabajo' : 'trabajos'
  })</td><td class="amount">${money(model.amount, model.currency)}</td></tr></tfoot>
</table>
<p class="muted">El colaborador declara haber recibido el importe total indicado por los trabajos listados.</p>
<table class="signatures">
  <tr>
    <td>Firma del colaborador<br /><br /><br />______________________________</td>
    <td>Por ${escapeHtml(branding.agencyName)}<br /><br /><br />______________________________</td>
  </tr>
</table>`;

  return page(`Recibo de pago ${model.reference}`, body, branding, {
    lang: 'es',
    licenseLabel: 'Licencia MINTUR',
  });
}

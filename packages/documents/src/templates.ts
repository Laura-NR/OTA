import type { DocumentBranding } from './branding';
import type { InvoiceModel, VoucherModel, WorkOrderModel } from './data';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function page(title: string, body: string, branding: DocumentBranding): string {
  const contact = [branding.supportPhone, branding.supportEmail]
    .filter((value): value is string => Boolean(value))
    .join(' · ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; margin: 0; font-size: 12px; }
  header { border-bottom: 3px solid ${branding.primaryColor}; padding-bottom: 12px; margin-bottom: 20px; }
  h1 { color: ${branding.primaryColor}; font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 20px 0 8px; }
  .muted { color: #6b7280; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
  th { background: #f3f4f6; }
  .total { font-weight: bold; }
  footer { position: fixed; bottom: 0; left: 0; right: 0; border-top: 1px solid #e5e7eb;
    padding-top: 6px; font-size: 10px; color: #6b7280; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(branding.agencyName)}</h1>
  <div class="muted">MINTUR License: ${escapeHtml(branding.licenseNumber)}</div>
</header>
${body}
<footer>
  ${escapeHtml(branding.agencyName)} · MINTUR ${escapeHtml(branding.licenseNumber)}${contact ? ` · ${escapeHtml(contact)}` : ''}
</footer>
</body>
</html>`;
}

export function renderVoucherHtml(
  model: VoucherModel,
  branding: DocumentBranding,
): string {
  const rows = model.services
    .map(
      (service) => `<tr>
        <td>${escapeHtml(service.serviceType)}</td>
        <td>${escapeHtml(service.province ?? '—')}</td>
        <td>${escapeHtml(formatDate(service.start))} → ${escapeHtml(formatDate(service.end))}</td>
        <td>${escapeHtml(service.supplierName ?? 'To be assigned')}${service.supplierPhone ? `<br/><span class="muted">${escapeHtml(service.supplierPhone)}</span>` : ''}</td>
      </tr>`,
    )
    .join('');

  const body = `
<h2>Service Voucher (Bono de Servicio)</h2>
<p class="muted">Booking ${escapeHtml(model.bookingCode)} · ${escapeHtml(model.travelerName)} (${escapeHtml(model.travelerEmail)})</p>
<p class="muted">Travel window: ${escapeHtml(formatDate(model.startDate))} → ${escapeHtml(formatDate(model.endDate))}</p>
<table>
  <thead><tr><th>Service</th><th>Province</th><th>Dates</th><th>Provider</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="4" class="muted">No services scheduled.</td></tr>'}</tbody>
</table>
<p class="total">Total: ${escapeHtml(model.totalAmount)} ${escapeHtml(model.totalCurrency)}</p>
<p class="muted">Present this voucher at each service. Emergency and provider contacts are listed above.</p>`;

  return page(`Voucher ${model.bookingCode}`, body, branding);
}

export function renderWorkOrderHtml(
  model: WorkOrderModel,
  branding: DocumentBranding,
): string {
  const body = `
<h2>Supplier Work Order (Orden de Trabajo)</h2>
<p class="muted">Booking ${escapeHtml(model.bookingCode)} · ${escapeHtml(model.serviceType)} · ${escapeHtml(model.province ?? '—')}</p>
<table>
  <tbody>
    <tr><th>Provider</th><td>${escapeHtml(model.supplierName ?? '—')} (${escapeHtml(model.supplierPhone ?? '—')})</td></tr>
    <tr><th>Guest</th><td>${escapeHtml(model.travelerName)}</td></tr>
    <tr><th>Schedule</th><td>${escapeHtml(formatDate(model.start))} → ${escapeHtml(formatDate(model.end))}</td></tr>
    <tr><th>Agreed rate</th><td>${escapeHtml(model.payoutRate)}</td></tr>
  </tbody>
</table>
<p class="muted">This order confirms the assignment above. Contact the operations desk for any change.</p>`;

  return page(`Work order ${model.bookingCode}`, body, branding);
}

export function renderInvoiceHtml(
  model: InvoiceModel,
  branding: DocumentBranding,
): string {
  const rows = model.lines
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.label)}</td><td>${escapeHtml(line.amount)} ${escapeHtml(model.currency)}</td></tr>`,
    )
    .join('');

  const body = `
<h2>Invoice</h2>
<p class="muted">Booking ${escapeHtml(model.bookingCode)} · Billed to ${escapeHtml(model.travelerName)}</p>
<table>
  <thead><tr><th>Description</th><th>Amount</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="total">Total due: ${escapeHtml(model.total)} ${escapeHtml(model.currency)}</p>`;

  return page(`Invoice ${model.bookingCode}`, body, branding);
}

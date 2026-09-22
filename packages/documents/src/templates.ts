import type { DocumentBranding, DocumentEmergencyContact } from './branding';
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

function formatDateTime(iso: string): string {
  const value = new Date(iso).toISOString();
  return `${value.slice(0, 10)} ${value.slice(11, 16)} UTC`;
}

/** Duty-of-care contacts: the agency support line first, then the tenant list. */
function emergencyContacts(branding: DocumentBranding): DocumentEmergencyContact[] {
  const contacts: DocumentEmergencyContact[] = [];
  if (branding.supportPhone) {
    contacts.push({
      label: `${branding.agencyName} support`,
      phone: branding.supportPhone,
    });
  }
  contacts.push(...branding.emergencyContacts.filter((contact) => contact.label));
  return contacts;
}

function emergencyBlock(branding: DocumentBranding): string {
  const contacts = emergencyContacts(branding);
  if (contacts.length === 0) {
    return '<p class="muted">Emergency contacts are configured by your agency.</p>';
  }
  return `<ul class="contacts">${contacts
    .map(
      (contact) =>
        `<li><strong>${escapeHtml(contact.label)}:</strong> ${escapeHtml(contact.phone)}</li>`,
    )
    .join('')}</ul>`;
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
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  th { background: #f3f4f6; }
  ul.contacts { margin: 6px 0 0; padding-left: 18px; }
  ul.contacts li { margin: 2px 0; }
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
        <td>${escapeHtml(service.province ?? 'Cuba')}<br/><span class="muted">${escapeHtml(formatDateTime(service.start))}</span></td>
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
  <thead><tr><th>Service</th><th>Rendezvous</th><th>Dates</th><th>Provider</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="4" class="muted">No services scheduled.</td></tr>'}</tbody>
</table>
<p class="total">Total: ${escapeHtml(model.totalAmount)} ${escapeHtml(model.totalCurrency)}</p>
<h2>Emergency &amp; duty of care</h2>
<p class="muted">Keep this voucher with you. Present it at each service, and use these contacts in an emergency.</p>
${emergencyBlock(branding)}`;

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
    <tr><th>Rendezvous</th><td>${escapeHtml(model.province ?? 'Cuba')} · ${escapeHtml(formatDateTime(model.start))}</td></tr>
    <tr><th>Schedule</th><td>${escapeHtml(formatDate(model.start))} → ${escapeHtml(formatDate(model.end))}</td></tr>
    <tr><th>Agreed rate</th><td>${escapeHtml(model.payoutRate)}</td></tr>
  </tbody>
</table>
<h2>Emergency protocol</h2>
<p class="muted">In an emergency, contact the operations desk first, then the relevant service below.</p>
${emergencyBlock(branding)}`;

  return page(`Work order ${model.bookingCode}`, body, branding);
}

export function renderInvoiceHtml(
  model: InvoiceModel,
  branding: DocumentBranding,
): string {
  const rows = model.services
    .map(
      (service) => `<tr>
        <td>${escapeHtml(service.serviceType)} — ${escapeHtml(service.province ?? 'Cuba')}</td>
        <td>${escapeHtml(formatDate(service.start))} → ${escapeHtml(formatDate(service.end))}</td>
        <td>${escapeHtml(service.providerName ?? 'Agency arranged')}</td>
      </tr>`,
    )
    .join('');

  const body = `
<h2>Invoice</h2>
<p class="muted">Booking ${escapeHtml(model.bookingCode)} · Billed to ${escapeHtml(model.travelerName)}</p>
<table>
  <thead><tr><th>Included service</th><th>Dates</th><th>Provider</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="3" class="muted">Curated travel package.</td></tr>'}</tbody>
</table>
<p class="total">Total due: ${escapeHtml(model.total)} ${escapeHtml(model.currency)}</p>
<p class="muted">Itemised by included service. See the voucher for rendezvous points and emergency contacts.</p>`;

  return page(`Invoice ${model.bookingCode}`, body, branding);
}

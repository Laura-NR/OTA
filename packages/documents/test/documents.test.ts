import { describe, expect, it } from 'vitest';

import {
  buildInvoiceModel,
  buildVoucherModel,
  buildWorkOrderModels,
  renderInvoiceHtml,
  renderVoucherHtml,
  renderWorkOrderHtml,
  type DocumentBranding,
  type ReservationDocumentInput,
} from '../src';

const branding: DocumentBranding = {
  agencyName: 'Authentic Cuba Expeditions',
  licenseNumber: 'MINTUR-TEST-1234',
  primaryColor: '#0f766e',
  supportEmail: 'ops@example.test',
  supportPhone: '+53 5555 0000',
  emergencyContacts: [{ label: 'Medical emergency', phone: '104' }],
};

const input: ReservationDocumentInput = {
  bookingCode: 'ABC12345',
  startDate: '2026-11-01T00:00:00.000Z',
  endDate: '2026-11-05T00:00:00.000Z',
  totalCurrency: 'EUR',
  totalAmount: '250.00',
  status: 'CONFIRMED',
  traveler: { fullName: 'Jane Traveler', email: 'jane@example.test' },
  serviceItems: [
    {
      id: 'item-1',
      serviceType: 'GUIDE',
      province: 'La Habana',
      serviceDateStart: '2026-11-02T09:00:00.000Z',
      serviceDateEnd: '2026-11-02T13:00:00.000Z',
      payoutRate: '40.00',
      supplier: { fullName: 'Guide One', primaryPhone: '+53 5555 1111' },
    },
    {
      id: 'item-2',
      serviceType: 'TRANSPORTATION',
      province: 'Matanzas',
      serviceDateStart: '2026-11-03T09:00:00.000Z',
      serviceDateEnd: '2026-11-03T11:00:00.000Z',
      payoutRate: '60.00',
      supplier: null,
    },
  ],
};

describe('document models', () => {
  it('builds a voucher with every service', () => {
    const voucher = buildVoucherModel(input);

    expect(voucher.bookingCode).toBe('ABC12345');
    expect(voucher.travelerName).toBe('Jane Traveler');
    expect(voucher.services).toHaveLength(2);
    expect(voucher.services[0]?.supplierName).toBe('Guide One');
  });

  it('builds work orders only for assigned services', () => {
    const orders = buildWorkOrderModels(input);

    expect(orders).toHaveLength(1);
    expect(orders[0]?.serviceItemId).toBe('item-1');
    expect(orders[0]?.payoutRate).toBe('40.00');
  });

  it('itemises the invoice by included service and totals the reservation', () => {
    const invoice = buildInvoiceModel(input);

    expect(invoice.currency).toBe('EUR');
    expect(invoice.total).toBe('250.00');
    expect(invoice.services).toHaveLength(2);
    expect(invoice.services[0]?.serviceType).toBe('GUIDE');
    expect(invoice.services[0]?.providerName).toBe('Guide One');
  });
});

describe('document templates', () => {
  it('injects the agency name and MINTUR license', () => {
    const html = renderVoucherHtml(buildVoucherModel(input), branding);

    expect(html).toContain('Authentic Cuba Expeditions');
    expect(html).toContain('MINTUR-TEST-1234');
    expect(html).toContain('ABC12345');
    expect(html).toContain('Guide One');
  });

  it('renders the invoice total and itemised services', () => {
    const html = renderInvoiceHtml(buildInvoiceModel(input), branding);

    expect(html).toContain('250.00');
    expect(html).toContain('MINTUR-TEST-1234');
    expect(html).toContain('GUIDE — La Habana');
  });

  it('adds rendezvous points and the emergency directory to the voucher', () => {
    const html = renderVoucherHtml(buildVoucherModel(input), branding);

    expect(html).toContain('Rendezvous');
    expect(html).toContain('Medical emergency');
    expect(html).toContain('104');
  });

  it('adds the emergency protocol to the work order', () => {
    const html = renderWorkOrderHtml(buildWorkOrderModels(input)[0]!, branding);

    expect(html).toContain('Emergency protocol');
    expect(html).toContain('Medical emergency');
  });

  it('escapes HTML in user-supplied values', () => {
    const html = renderVoucherHtml(
      buildVoucherModel({
        ...input,
        traveler: { fullName: '<script>evil</script>', email: 'x@example.test' },
      }),
      branding,
    );

    expect(html).not.toContain('<script>evil</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

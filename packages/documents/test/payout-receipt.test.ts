import { describe, expect, it } from 'vitest';

import {
  renderPayoutReceiptHtml,
  type DocumentBranding,
  type PayoutReceiptModel,
} from '../src';

const branding: DocumentBranding = {
  agencyName: 'Vereda Expeditions',
  licenseNumber: 'MINTUR-TEST-1234',
  primaryColor: '#0B4F6C',
  supportEmail: null,
  supportPhone: null,
  emergencyContacts: [],
};

const model: PayoutReceiptModel = {
  reference: 'PG-7B0D7C3E',
  workerName: 'Reinier <Soto>',
  workerPhone: '+53 5555 0199',
  licenseNumber: 'RTN-0042',
  method: 'CASH_OFFICE',
  office: 'oficina Vedado',
  paidAt: '2026-10-10',
  currency: 'EUR',
  amount: '115.00',
  jobs: [
    {
      endedOn: '2026-10-01',
      bookingCode: 'VX-4WQ7EB',
      serviceType: 'TRANSPORTATION',
      province: 'La Habana',
      amount: '25.00',
    },
    {
      endedOn: '2026-10-03',
      bookingCode: 'VX-4WQ7EB',
      serviceType: 'GUIDE',
      province: null,
      amount: '90.00',
    },
  ],
};

describe('the payout receipt (W-Earnings E5)', () => {
  it('names the worker, the day, the method, each job and the total, in Spanish', () => {
    const html = renderPayoutReceiptHtml(model, branding);
    expect(html).toContain('lang="es"');
    expect(html).toContain('Recibo de pago · PG-7B0D7C3E');
    expect(html).toContain('10 de octubre de 2026');
    expect(html).toContain('Efectivo · oficina Vedado');
    expect(html).toContain('Traslado · La Habana');
    expect(html).toContain('Total (2 trabajos)');
    expect(html).toContain('115.00 EUR');
    expect(html).toContain('Firma del colaborador');
    expect(html).toContain('Licencia MINTUR: MINTUR-TEST-1234');
  });

  it('escapes what the desk typed', () => {
    const html = renderPayoutReceiptHtml(model, branding);
    expect(html).toContain('Reinier &lt;Soto&gt;');
    expect(html).not.toContain('<Soto>');
  });

  it('reads a bank transfer without an office', () => {
    const html = renderPayoutReceiptHtml(
      { ...model, method: 'BANK_TRANSFER', jobs: model.jobs.slice(0, 1) },
      branding,
    );
    expect(html).toContain('Transferencia bancaria');
    expect(html).not.toContain('oficina Vedado');
    expect(html).toContain('Total (1 trabajo)');
  });
});

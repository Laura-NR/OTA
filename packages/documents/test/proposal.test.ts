import { describe, expect, it } from 'vitest';

import {
  proposalPdfLocale,
  renderProposalHtml,
  type DocumentBranding,
  type ProposalPdfModel,
} from '../src';

const branding: DocumentBranding = {
  agencyName: 'Authentic Cuba Expeditions',
  licenseNumber: 'MINTUR-TEST-1234',
  primaryColor: '#0f766e',
  supportEmail: 'ops@example.test',
  supportPhone: null,
  emergencyContacts: [],
};

const model: ProposalPdfModel = {
  reference: 'VX-C-ABCD1234',
  version: 2,
  travelerName: 'Klaus Müller',
  createdAt: '2026-10-07T09:00:00.000Z',
  validUntil: '2026-10-21T23:59:59.999Z',
  startDate: '2027-03-04T00:00:00.000Z',
  endDate: '2027-03-17T00:00:00.000Z',
  adults: 2,
  children: 0,
  summary: 'Fourteen days west to Trinidad.\nBirding first.',
  notes: null,
  stops: [{ province: 'Pinar del Río', nights: 3, accommodation: 'Casa Yamilé' }],
  days: [
    { day: 1, location: 'Havana', plan: 'Arrive; walk the Malecón.', with: 'Driver' },
  ],
  options: [{ label: 'Sail Cienfuegos bay', description: 'Day 9', price: 90 }],
  lines: [
    {
      label: 'Transport',
      description: 'Private driver',
      quantity: '1.00',
      amount: '1640.00',
    },
    { label: 'Lodging', description: null, quantity: '13.00', amount: '1300.00' },
  ],
  currency: 'EUR',
  total: '2940.00',
  perPerson: '1470.00',
  planningFee: 140,
  portalUrl: 'https://vereda.example/en/account/proposals/abc',
};

describe('renderProposalHtml (D-Proposal)', () => {
  it('prints the version, the route, the days, the lines, the options and the total', () => {
    const html = renderProposalHtml(model, branding, 'en');

    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Proposal · version 2');
    expect(html).toContain('VX-C-ABCD1234');
    expect(html).toContain('prices held until October 21, 2026');
    expect(html).toContain('2 adults · March 4, 2027 → March 17, 2027 · 13 nights');
    expect(html).toContain('Pinar del Río');
    expect(html).toContain('3 nights · Casa Yamilé');
    expect(html).toContain('Arrive; walk the Malecón.');
    // Day 1 is the trip's first calendar day.
    expect(html).toContain('Thu, Mar 4');
    expect(html).toContain('€1,640.00');
    expect(html).toContain('€2,940.00');
    expect(html).toContain('€1,470.00 per person');
    expect(html).toContain('Sail Cienfuegos bay');
    expect(html).toContain('MINTUR License: MINTUR-TEST-1234');
    expect(html).toContain(model.portalUrl);
  });

  it('shows the planning fee for transparency only, outside the total', () => {
    const html = renderProposalHtml(model, branding, 'en');
    expect(html).toContain(
      'Planning fee €140.00, shown for transparency and not added to the total.',
    );
    expect(html).not.toContain('€3,080.00');
  });

  it("is written in the traveler's locale", () => {
    const es = renderProposalHtml(model, branding, 'es-ES');
    expect(es).toContain('<html lang="es">');
    expect(es).toContain('Propuesta · versión 2');
    expect(es).toContain('Licencia MINTUR: MINTUR-TEST-1234');
    expect(es).toContain('3 noches · Casa Yamilé');

    const fr = renderProposalHtml(model, branding, 'fr');
    expect(fr).toContain('Proposition · version 2');
    expect(fr).toContain('Jour par jour');

    expect(proposalPdfLocale('de')).toBe('en');
    expect(proposalPdfLocale(null)).toBe('en');
  });

  it('leaves out the sections that have no data', () => {
    const html = renderProposalHtml(
      { ...model, stops: [], days: [], options: [], planningFee: null, perPerson: null },
      branding,
      'en',
    );
    expect(html).not.toContain('<h2>Route</h2>');
    expect(html).not.toContain('<h2>Day by day</h2>');
    expect(html).not.toContain('Options you can add');
    expect(html).not.toContain('Planning fee');
    expect(html).not.toContain('per person');
  });

  it('escapes the desk and traveler text', () => {
    const html = renderProposalHtml(
      { ...model, summary: '<script>evil</script>', travelerName: 'A & B' },
      branding,
      'en',
    );
    expect(html).not.toContain('<script>evil</script>');
    expect(html).toContain('&lt;script&gt;evil&lt;/script&gt;');
    expect(html).toContain('Prepared for A &amp; B');
  });
});

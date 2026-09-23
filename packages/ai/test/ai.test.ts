import { describe, expect, it } from 'vitest';

import { MockLlmProvider, createLlmProvider } from '../src';

describe('MockLlmProvider', () => {
  it('drafts a contextual reply in the traveler locale', async () => {
    const provider = new MockLlmProvider();

    const draft = await provider.draftReply({
      bookingCode: 'DEMO0001',
      locale: 'es',
      status: 'PENDING_PAYMENT',
      travelerName: 'Ana',
      serviceSummary: ['Casa Colonial: day 1'],
      latestMessage: 'Can we arrive a day earlier?',
    });

    expect(draft.subject).toContain('DEMO0001');
    expect(draft.body).toContain('Hola Ana');
    expect(draft.body).toContain('Casa Colonial: day 1');
    expect(draft.body).toContain('Can we arrive a day earlier?');
  });

  it('falls back to English for an unsupported locale', async () => {
    const draft = await new MockLlmProvider().draftReply({
      bookingCode: 'X1',
      locale: 'de',
      status: 'DRAFT',
      travelerName: null,
      serviceSummary: [],
      latestMessage: null,
    });

    expect(draft.body).toContain('Hello traveler');
  });

  it('summarises KPIs deterministically', async () => {
    const summary = await new MockLlmProvider().summarize({
      range: { from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z' },
      bookings: 10,
      paidCount: 7,
      gbv: 1500,
      netRevenue: 900,
      acceptanceRate: 0.75,
      topProvinces: [{ province: 'La Habana', count: 6 }],
    });

    expect(summary.text).toContain('10 bookings');
    expect(summary.text).toContain('€1500.00 gross');
    expect(summary.text).toContain('75%');
    expect(summary.text).toContain('La Habana (6)');
  });

  it('never contacts a network and tags translations', async () => {
    const provider = createLlmProvider();

    await expect(
      provider.translate({ text: 'Hello', targetLocale: 'fr' }),
    ).resolves.toEqual({ text: '[fr] Hello', targetLocale: 'fr' });
  });
});

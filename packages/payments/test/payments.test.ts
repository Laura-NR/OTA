import { describe, expect, it } from 'vitest';

import { MockPaymentProvider, createPaymentProvider } from '../src';

describe('MockPaymentProvider', () => {
  it('creates a pending intent with a gateway reference and checkout URL', async () => {
    const provider = new MockPaymentProvider({
      checkoutBaseUrl: 'http://localhost:3000',
    });

    const intent = await provider.createIntent({
      reference: 'DEMO0001',
      amount: 321,
      currency: 'EUR',
      rail: 'CARD',
    });

    expect(intent.status).toBe('PENDING');
    expect(intent.providerReference).toMatch(/^mock_/);
    expect(intent.checkoutUrl).toBe(
      `http://localhost:3000/checkout/mock/${intent.providerReference}`,
    );
    expect(intent).toMatchObject({ amount: 321, currency: 'EUR', rail: 'CARD' });
  });

  it('accepts a well-formed paid webhook', () => {
    const provider = createPaymentProvider();

    expect(
      provider.parseWebhook({
        providerReference: 'mock_abc',
        status: 'PAID',
        amount: 321,
        currency: 'EUR',
      }),
    ).toEqual({
      providerReference: 'mock_abc',
      status: 'PAID',
      amount: 321,
      currency: 'EUR',
    });
  });

  it('rejects a malformed or unauthentic webhook', () => {
    const provider = createPaymentProvider();

    expect(provider.parseWebhook(null)).toBeNull();
    expect(provider.parseWebhook('PAID')).toBeNull();
    expect(
      provider.parseWebhook({
        providerReference: 'mock_abc',
        status: 'SOMETHING',
        amount: 1,
        currency: 'EUR',
      }),
    ).toBeNull();
    expect(
      provider.parseWebhook({
        providerReference: 'mock_abc',
        status: 'PAID',
        amount: -1,
        currency: 'EUR',
      }),
    ).toBeNull();
    expect(
      provider.parseWebhook({
        providerReference: 'mock_abc',
        status: 'PAID',
        amount: 1,
        currency: 'EURO',
      }),
    ).toBeNull();
  });
});

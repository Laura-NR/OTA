import { describe, expect, it } from 'vitest';

import {
  BankTransferProvider,
  MockPaymentProvider,
  createPaymentProvider,
  createPaymentProviders,
} from '../src';

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

describe('BankTransferProvider', () => {
  it('creates a wire intent pointing at the instructions page', async () => {
    const provider = new BankTransferProvider({
      checkoutBaseUrl: 'http://localhost:3000',
    });

    const intent = await provider.createIntent({
      reference: 'DEMO0001',
      amount: 321,
      currency: 'EUR',
      rail: 'OPEN_BANKING_SEPA',
    });

    expect(intent.status).toBe('PENDING');
    expect(intent.providerReference).toMatch(/^wire_/);
    expect(intent.checkoutUrl).toContain(
      `http://localhost:3000/checkout/wire/${intent.providerReference}`,
    );
    expect(intent.checkoutUrl).toContain('reference=DEMO0001');
    expect(intent.checkoutUrl).toContain('amount=321.00');
    expect(intent.checkoutUrl).toContain('currency=EUR');
    expect(intent).toMatchObject({
      amount: 321,
      currency: 'EUR',
      rail: 'OPEN_BANKING_SEPA',
    });
  });

  it('accepts an operator confirmation and rejects malformed payloads', () => {
    const provider = createPaymentProvider({ provider: 'bank_transfer' });

    expect(
      provider.parseWebhook({
        providerReference: 'wire_abc',
        status: 'PAID',
        amount: 10,
        currency: 'EUR',
      }),
    ).toEqual({
      providerReference: 'wire_abc',
      status: 'PAID',
      amount: 10,
      currency: 'EUR',
    });
    expect(provider.parseWebhook({})).toBeNull();
    expect(provider.parseWebhook(null)).toBeNull();
  });
});

describe('createPaymentProviders', () => {
  it('routes the primary rails: SEPA to wire, card to the mock', () => {
    const providers = createPaymentProviders();

    expect(providers.OPEN_BANKING_SEPA).toBeInstanceOf(BankTransferProvider);
    expect(providers.OTHER).toBeInstanceOf(BankTransferProvider);
    expect(providers.CARD).toBeInstanceOf(MockPaymentProvider);
  });
});

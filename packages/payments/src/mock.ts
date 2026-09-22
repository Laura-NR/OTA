import { randomUUID } from 'node:crypto';

import type {
  CreatePaymentIntentInput,
  PaymentIntent,
  PaymentProvider,
  PaymentWebhookEvent,
} from './provider';

export interface MockPaymentProviderOptions {
  /** Base URL the mock checkout page is served from (dev/tests only). */
  checkoutBaseUrl?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * In-process stand-in for a real gateway so checkout and the confirmation
 * workflow can be built and tested before a provider is chosen. It never
 * touches the network and issues deterministic local references.
 */
export class MockPaymentProvider implements PaymentProvider {
  constructor(private readonly options: MockPaymentProviderOptions = {}) {}

  async createIntent(input: CreatePaymentIntentInput): Promise<PaymentIntent> {
    const providerReference = `mock_${randomUUID()}`;
    const base = this.options.checkoutBaseUrl ?? '';
    return {
      providerReference,
      status: 'PENDING',
      checkoutUrl: `${base}/checkout/mock/${providerReference}`,
      amount: input.amount,
      currency: input.currency,
      rail: input.rail,
    };
  }

  parseWebhook(payload: unknown): PaymentWebhookEvent | null {
    if (!isRecord(payload)) {
      return null;
    }
    const { providerReference, status, amount, currency } = payload;
    if (typeof providerReference !== 'string' || providerReference.length === 0) {
      return null;
    }
    if (status !== 'PAID' && status !== 'FAILED') {
      return null;
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      return null;
    }
    if (typeof currency !== 'string' || currency.length !== 3) {
      return null;
    }
    return { providerReference, status, amount, currency };
  }
}

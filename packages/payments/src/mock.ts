import { randomUUID } from 'node:crypto';

import { parsePaymentConfirmation } from './confirmation';
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
    return parsePaymentConfirmation(payload);
  }
}

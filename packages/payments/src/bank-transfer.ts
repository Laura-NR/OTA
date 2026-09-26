import { randomUUID } from 'node:crypto';

import { parsePaymentConfirmation } from './confirmation';
import type {
  CreatePaymentIntentInput,
  PaymentIntent,
  PaymentProvider,
  PaymentWebhookEvent,
} from './provider';

export interface BankTransferProviderOptions {
  /** Storefront base URL where the wire-instructions page is served. */
  checkoutBaseUrl?: string;
}

/**
 * Manual wire transfer (spec §7.1, primary rail). There is no gateway: the
 * intent points the traveler at a page with the agency's bank details, and an
 * operations user confirms the receipt once funds arrive. `parseWebhook`
 * therefore accepts only the operator-submitted confirmation payload and there
 * is deliberately no public callback for this rail (ADR 0003).
 */
export class BankTransferProvider implements PaymentProvider {
  constructor(private readonly options: BankTransferProviderOptions = {}) {}

  async createIntent(input: CreatePaymentIntentInput): Promise<PaymentIntent> {
    const providerReference = `wire_${randomUUID()}`;
    const base = this.options.checkoutBaseUrl ?? '';

    return {
      providerReference,
      status: 'PENDING',
      // The page fetches the authoritative amount/reference by this reference,
      // so nothing sensitive is carried in the URL.
      checkoutUrl: `${base}/checkout/wire/${providerReference}`,
      amount: input.amount,
      currency: input.currency,
      rail: input.rail,
    };
  }

  parseWebhook(payload: unknown): PaymentWebhookEvent | null {
    return parsePaymentConfirmation(payload);
  }
}

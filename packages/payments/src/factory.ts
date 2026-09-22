import { MockPaymentProvider } from './mock';
import type { PaymentProvider } from './provider';

export type PaymentProviderName = 'mock';

export interface PaymentProviderOptions {
  /** Which adapter to build. Only the mock ships until ADR 0003 is resolved. */
  provider?: PaymentProviderName;
  checkoutBaseUrl?: string;
}

/**
 * Build the payment adapter for a deployment. Real rails are added here once a
 * provider and its Cuba-sanctions clearance are confirmed; core code depends on
 * the `PaymentProvider` interface only.
 */
export function createPaymentProvider(
  options: PaymentProviderOptions = {},
): PaymentProvider {
  return new MockPaymentProvider({ checkoutBaseUrl: options.checkoutBaseUrl });
}

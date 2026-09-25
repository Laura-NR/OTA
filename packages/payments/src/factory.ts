import { BankTransferProvider } from './bank-transfer';
import { MockPaymentProvider } from './mock';
import type { PaymentProvider, PaymentRail } from './provider';

export type PaymentProviderName = 'mock' | 'bank_transfer';

export interface PaymentProviderOptions {
  /** Which adapter to build. Defaults to the mock (dev/tests). */
  provider?: PaymentProviderName;
  checkoutBaseUrl?: string;
}

/**
 * Build a single payment adapter. Real card rails (TropiPay) are added here once
 * a provider and its Cuba-sanctions clearance are confirmed; core code depends
 * on the `PaymentProvider` interface only.
 */
export function createPaymentProvider(
  options: PaymentProviderOptions = {},
): PaymentProvider {
  switch (options.provider ?? 'mock') {
    case 'bank_transfer':
      return new BankTransferProvider({ checkoutBaseUrl: options.checkoutBaseUrl });
    case 'mock':
    default:
      return new MockPaymentProvider({ checkoutBaseUrl: options.checkoutBaseUrl });
  }
}

export interface PaymentProviderSetOptions {
  checkoutBaseUrl?: string;
  /** Adapter for the card rail; the mock until a real gateway is cleared. */
  cardProvider?: PaymentProviderName;
  /** Adapter for the open-banking/SEPA rail; wire transfer by default. */
  bankTransferProvider?: PaymentProviderName;
}

/**
 * Rail -> provider map (spec §7.1). Wire transfer is the primary rail for
 * SEPA/open banking; the card rail stays on the mock until a signed card
 * gateway is wired. Later rails are added to the returned record.
 */
export function createPaymentProviders(
  options: PaymentProviderSetOptions = {},
): Record<PaymentRail, PaymentProvider> {
  const cardProvider = createPaymentProvider({
    provider: options.cardProvider ?? 'mock',
    checkoutBaseUrl: options.checkoutBaseUrl,
  });
  const bankTransferProvider = createPaymentProvider({
    provider: options.bankTransferProvider ?? 'bank_transfer',
    checkoutBaseUrl: options.checkoutBaseUrl,
  });

  return {
    CARD: cardProvider,
    OPEN_BANKING_SEPA: bankTransferProvider,
    OTHER: bankTransferProvider,
  };
}

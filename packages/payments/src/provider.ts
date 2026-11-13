/** Payment rails the platform can settle through (spec §7.1). */
export type PaymentRail = 'OPEN_BANKING_SEPA' | 'CARD' | 'OTHER';

export type PaymentIntentStatus = 'PENDING' | 'PAID' | 'FAILED';

export interface CreatePaymentIntentInput {
  /** Human reference shown to the client and on the statement. */
  reference: string;
  /** Amount in major units (e.g. euros). */
  amount: number;
  currency: string;
  rail: PaymentRail;
  /** Where the gateway returns the client after payment, when supported. */
  returnUrl?: string;
}

export interface PaymentIntent {
  /** Gateway reference persisted on the PaymentReceipt. */
  providerReference: string;
  status: PaymentIntentStatus;
  checkoutUrl: string;
  amount: number;
  currency: string;
  rail: PaymentRail;
}

export interface RefundInput {
  /** The gateway reference of the payment being refunded. */
  providerReference: string;
  amount: number;
  currency: string;
  /**
   * The platform's refund id, sent as the gateway's idempotency key: a retry
   * with the same key can never refund twice (A-Payments, M4 D7).
   */
  idempotencyKey: string;
}

export interface RefundResult {
  providerRefundId: string;
}

export interface PaymentWebhookEvent {
  providerReference: string;
  status: 'PAID' | 'FAILED';
  amount: number;
  currency: string;
}

/**
 * Provider-agnostic payment adapter. Concrete rails (SEPA/open banking, card,
 * TropiPay) are added behind this interface once the ADR 0003 decision and the
 * Cuba-sanctions review land; core code never talks to a gateway SDK directly.
 */
export interface PaymentProvider {
  createIntent(input: CreatePaymentIntentInput): Promise<PaymentIntent>;
  /**
   * Parse and authenticate a gateway callback. Returns null for an inauthentic
   * or malformed payload so the caller rejects it rather than trusting it.
   */
  parseWebhook(payload: unknown): PaymentWebhookEvent | null;
  /**
   * Return money through the gateway. Absent on rails the agency refunds by
   * its own bank transfer (the wire rail): the desk then records the bank's
   * reference.
   */
  refund?(input: RefundInput): Promise<RefundResult>;
}

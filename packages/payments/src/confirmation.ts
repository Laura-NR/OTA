import type { PaymentWebhookEvent } from './provider';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Read a confirmation payload into a payment event. Used by the mock and the
 * manual wire-transfer rail, where an authenticated operations user is the one
 * submitting it; real gateways implement signature verification in their own
 * `parseWebhook` instead. Returns null for a malformed payload.
 */
export function parsePaymentConfirmation(payload: unknown): PaymentWebhookEvent | null {
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

import { z } from 'zod';

/** Mirrors the Prisma `PaymentRail` / `PaymentStatus` enums (spec §7.1). */
export const paymentRailSchema = z.enum(['OPEN_BANKING_SEPA', 'CARD', 'OTHER']);

export const paymentStatusSchema = z.enum([
  'PENDING',
  'AUTHORIZED',
  'PAID',
  'FAILED',
  'REFUNDED',
]);

export const createPaymentIntentSchema = z.object({
  rail: paymentRailSchema,
  /**
   * M4: deposit or full, chosen with the first link; ignored once the booking
   * has a schedule. Omitted means full.
   */
  plan: z.enum(['DEPOSIT', 'FULL']).optional(),
});

export type CreatePaymentIntentRequest = z.infer<typeof createPaymentIntentSchema>;

export const paymentReceiptSchema = z.object({
  id: z.string().uuid(),
  reservationId: z.string().uuid(),
  rail: paymentRailSchema,
  amount: z.string(),
  /** M4 D6: the rail's fee charged on top of the amount. */
  feeAmount: z.string(),
  /** M4 D1: the instalment it pays; null for payments made before M4. */
  instalmentId: z.string().uuid().nullable(),
  currency: z.string(),
  status: paymentStatusSchema,
  createdAt: z.string(),
});

export type PaymentReceiptDto = z.infer<typeof paymentReceiptSchema>;

/** The operations payment ledger: receipts across every booking, newest first. */
export const paymentLedgerQuerySchema = z.object({
  status: paymentStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type PaymentLedgerQuery = z.infer<typeof paymentLedgerQuerySchema>;

export const paymentLedgerEntrySchema = paymentReceiptSchema.extend({
  bookingCode: z.string(),
  updatedAt: z.string(),
});

export type PaymentLedgerEntryDto = z.infer<typeof paymentLedgerEntrySchema>;

/** A receipt plus the gateway URL the client is sent to in order to pay. */
export const paymentIntentSchema = paymentReceiptSchema.extend({
  checkoutUrl: z.string(),
});

export type PaymentIntentDto = z.infer<typeof paymentIntentSchema>;

/**
 * Minimal, PII-free view of an intent for the wire-instructions page, looked up
 * by its unguessable provider reference (capability URL).
 */
export const paymentIntentLookupSchema = z.object({
  reference: z.string(),
  rail: paymentRailSchema,
  amount: z.string(),
  currency: z.string(),
  status: paymentStatusSchema,
});

export type PaymentIntentLookupDto = z.infer<typeof paymentIntentLookupSchema>;

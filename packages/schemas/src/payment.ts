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
});

export type CreatePaymentIntentRequest = z.infer<typeof createPaymentIntentSchema>;

export const paymentReceiptSchema = z.object({
  id: z.string().uuid(),
  reservationId: z.string().uuid(),
  rail: paymentRailSchema,
  amount: z.string(),
  currency: z.string(),
  status: paymentStatusSchema,
  createdAt: z.string(),
});

export type PaymentReceiptDto = z.infer<typeof paymentReceiptSchema>;

/** A receipt plus the gateway URL the client is sent to in order to pay. */
export const paymentIntentSchema = paymentReceiptSchema.extend({
  checkoutUrl: z.string(),
});

export type PaymentIntentDto = z.infer<typeof paymentIntentSchema>;

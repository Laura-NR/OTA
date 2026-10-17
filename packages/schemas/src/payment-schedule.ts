import { z } from 'zod';

import { paymentRailSchema, paymentReceiptSchema, paymentStatusSchema } from './payment';

/**
 * M4 payment schedule (`docs/schema-m4-payment-schedule.md`): the instalments a
 * booking owes, proofs of transfer, and refunds with their approvals. A proof
 * never carries its storage key; its file is read through an audited route.
 */

export const paymentPlanSchema = z.enum(['DEPOSIT', 'FULL']);
export const instalmentKindSchema = z.enum(['DEPOSIT', 'BALANCE', 'FULL']);
export const instalmentStatusSchema = z.enum(['DUE', 'PAID', 'WAIVED', 'CANCELLED']);
export const proofStatusSchema = z.enum(['SUBMITTED', 'ACCEPTED', 'REJECTED']);
export const refundReasonSchema = z.enum([
  'TRAVELER_CANCELLATION',
  'HOST_CANCELLATION',
  'FORCE_MAJEURE',
  'GOODWILL',
  'PRICE_CORRECTION',
]);
export const refundStatusSchema = z.enum([
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'SENT',
  'FAILED',
]);

export type PaymentPlanDto = z.infer<typeof paymentPlanSchema>;
export type RefundReasonDto = z.infer<typeof refundReasonSchema>;
export type RefundStatusDto = z.infer<typeof refundStatusSchema>;

export const instalmentSchema = z.object({
  id: z.string().uuid(),
  kind: instalmentKindSchema,
  position: z.number().int(),
  amount: z.string(),
  currency: z.string(),
  dueAt: z.string(),
  status: instalmentStatusSchema,
  paidAt: z.string().nullable(),
});

export type InstalmentDto = z.infer<typeof instalmentSchema>;

export const proofSummarySchema = z.object({
  id: z.string().uuid(),
  receiptId: z.string().uuid(),
  status: proofStatusSchema,
  /** What the traveler is told on a rejection, or the desk's note. */
  reviewNote: z.string().nullable(),
  createdAt: z.string(),
  reviewedAt: z.string().nullable(),
});

export type ProofSummaryDto = z.infer<typeof proofSummarySchema>;

export const scheduleReceiptSchema = paymentReceiptSchema.extend({
  proofs: z.array(proofSummarySchema),
});

export type ScheduleReceiptDto = z.infer<typeof scheduleReceiptSchema>;

export const refundApprovalSchema = z.object({
  approverEmail: z.string().nullable(),
  approve: z.boolean(),
  note: z.string().nullable(),
  createdAt: z.string(),
});

export const refundDecisionSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('APPROVED') }),
  z.object({ state: z.literal('REJECTED') }),
  z.object({
    state: z.literal('PENDING'),
    missing: z.number().int(),
    superAdmin: z.boolean(),
  }),
]);

export const refundSchema = z.object({
  id: z.string().uuid(),
  reservationId: z.string().uuid(),
  bookingCode: z.string(),
  receiptId: z.string().uuid(),
  rail: paymentRailSchema,
  amount: z.string(),
  currency: z.string(),
  reason: refundReasonSchema,
  note: z.string(),
  /** The cancellation band it was computed with; null for an amount set by hand. */
  rule: z
    .object({
      policyKey: z.string(),
      daysBefore: z.number().int(),
      fromDays: z.number().int(),
      keepPercent: z.number(),
      fee: z.number(),
      paid: z.number(),
    })
    .nullable(),
  status: refundStatusSchema,
  providerRefundId: z.string().nullable(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
  requestedByEmail: z.string().nullable(),
  approvals: z.array(refundApprovalSchema),
  /** While REQUESTED, who still has to approve. */
  decision: refundDecisionSchema,
});

export type RefundDto = z.infer<typeof refundSchema>;

/** What the traveler may choose before the first payment link exists. */
export const paymentOptionsSchema = z.object({
  full: z.object({ amount: z.string() }),
  /** Null when the package has no deposit plan or departure is too close. */
  deposit: z
    .object({
      amount: z.string(),
      balance: z.string(),
      balanceDueAt: z.string(),
      percent: z.number(),
    })
    .nullable(),
});

export const paymentScheduleSchema = z.object({
  reservationId: z.string().uuid(),
  currency: z.string(),
  total: z.string(),
  /** PAID receipts, net of nothing: refunds are listed apart. */
  paid: z.string(),
  refunded: z.string(),
  instalments: z.array(instalmentSchema),
  /** Present until the plan is chosen, while the booking can be paid. */
  options: paymentOptionsSchema.nullable(),
  /** The next instalment still due, if any. */
  nextInstalmentId: z.string().uuid().nullable(),
  windowHours: z.number().int(),
  cardFeePercent: z.number(),
  receipts: z.array(scheduleReceiptSchema),
  refunds: z.array(refundSchema),
});

export type PaymentScheduleDto = z.infer<typeof paymentScheduleSchema>;

/** A proof of transfer: PDF or a photo, up to 10 MB (Payment board). */
export const proofUploadSchema = z.object({
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  contentBase64: z.string().min(1),
});

export type ProofUploadRequest = z.infer<typeof proofUploadSchema>;

export const proofQueueQuerySchema = z.object({
  status: proofStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type ProofQueueQuery = z.infer<typeof proofQueueQuerySchema>;

/** A proof in the A-Payments queue, with the payment it is for. */
export const proofQueueItemSchema = proofSummarySchema.extend({
  reservationId: z.string().uuid(),
  bookingCode: z.string(),
  rail: paymentRailSchema,
  amount: z.string(),
  currency: z.string(),
  receiptStatus: paymentStatusSchema,
  instalmentKind: instalmentKindSchema.nullable(),
  /** The payment window the proof is racing against. */
  dueAt: z.string().nullable(),
  contentType: z.string(),
  uploadedByEmail: z.string().nullable(),
});

export type ProofQueueItemDto = z.infer<typeof proofQueueItemSchema>;

export const acceptProofSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const rejectProofSchema = z.object({
  /** Shown to the traveler: what to fix. */
  note: z.string().trim().min(1).max(500),
});

export type AcceptProofRequest = z.infer<typeof acceptProofSchema>;
export type RejectProofRequest = z.infer<typeof rejectProofSchema>;

/** Give the traveler more time on an instalment (A-Payments "Extend 24 h"). */
export const extendInstalmentSchema = z.object({
  hours: z.number().int().min(1).max(168).default(24),
});

export type ExtendInstalmentRequest = z.infer<typeof extendInstalmentSchema>;

export const createRefundSchema = z.object({
  receiptId: z.string().uuid(),
  reason: refundReasonSchema,
  /** Mandatory: it goes to the audit log. */
  note: z.string().trim().min(3).max(1000),
  /**
   * Omitted: the cancellation scale's amount for a traveler cancellation, or
   * all that is left on the receipt for a host cancellation or force majeure.
   */
  amount: z.number().positive().optional(),
});

export type CreateRefundRequest = z.infer<typeof createRefundSchema>;

export const refundVoteSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const rejectRefundSchema = z.object({
  note: z.string().trim().min(1).max(500),
});

export const refundSentSchema = z.object({
  /** The bank's transfer reference for a refund paid by the agency's bank. */
  reference: z.string().trim().min(1).max(100),
});

export type RefundVoteRequest = z.infer<typeof refundVoteSchema>;
export type RejectRefundRequest = z.infer<typeof rejectRefundSchema>;
export type RefundSentRequest = z.infer<typeof refundSentSchema>;

export const refundQueueQuerySchema = z.object({
  status: refundStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type RefundQueueQuery = z.infer<typeof refundQueueQuerySchema>;

/** The amount the cancellation scale suggests today, before a refund is created. */
export const refundQuoteSchema = z.object({
  receiptId: z.string().uuid(),
  paid: z.string(),
  alreadyRefunded: z.string(),
  suggested: z.string(),
  rule: refundSchema.shape.rule,
});

export type RefundQuoteDto = z.infer<typeof refundQuoteSchema>;

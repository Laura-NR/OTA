import { PAYOUT_MAX_JOBS } from '@ota/domain';
import { z } from 'zod';

import { serviceTypeSchema } from './dispatch';
import { calendarDaySchema, payoutMethodSchema } from './supplier';

/**
 * W-Earnings payouts (`docs/schema-w-earnings.md`, approved E1–E8): the desk
 * records a payment after the money changed hands; the worker app reads it
 * with its receipt.
 */

/** One payment to a worker, covering one or more finished jobs (E1). */
export const workerPaymentSchema = z.object({
  id: z.string().uuid(),
  method: payoutMethodSchema,
  currency: z.string(),
  amount: z.string(),
  /** The day paid, `YYYY-MM-DD`. */
  paidAt: z.string(),
  jobs: z.number().int(),
});

export type WorkerPaymentDto = z.infer<typeof workerPaymentSchema>;

/** A payment as the desk lists it: also who recorded it, and when. */
export const supplierPaymentSchema = workerPaymentSchema.extend({
  recordedBy: z.string().nullable(),
  createdAt: z.string(),
});

export type SupplierPaymentDto = z.infer<typeof supplierPaymentSchema>;

/** A finished job not yet paid, as "Record payout…" offers it. */
export const payableJobSchema = z.object({
  serviceItemId: z.string().uuid(),
  serviceType: serviceTypeSchema,
  province: z.string().nullable(),
  endsAt: z.string(),
  bookingCode: z.string(),
  payout: z.string(),
  /** A failed payout is paid by a new payment, like a pending one. */
  payoutState: z.enum(['PENDING', 'ISSUE']),
});

export type PayableJobDto = z.infer<typeof payableJobSchema>;

/** `GET /suppliers/:id/payouts`: what can be paid, and the payments made. */
export const supplierPayoutLedgerSchema = z.object({
  currency: z.string(),
  payable: z.array(payableJobSchema),
  payments: z.array(supplierPaymentSchema),
});

export type SupplierPayoutLedgerDto = z.infer<typeof supplierPayoutLedgerSchema>;

/**
 * `POST /suppliers/:id/payouts`: the jobs paid, how and on which day. The
 * amount is the jobs' payouts, summed by the API, never sent.
 */
export const recordSupplierPayoutSchema = z.object({
  serviceItemIds: z
    .array(z.string().uuid())
    .min(1)
    .max(PAYOUT_MAX_JOBS)
    .refine((ids) => new Set(ids).size === ids.length, 'A job is listed twice'),
  method: payoutMethodSchema,
  paidAt: calendarDaySchema,
});

export type RecordSupplierPayoutRequest = z.infer<typeof recordSupplierPayoutSchema>;

/** `PUT /suppliers/:id/payout-method` (E2, E3): null clears it. */
export const setPayoutMethodSchema = z.object({
  method: payoutMethodSchema.nullable(),
});

export type SetPayoutMethodRequest = z.infer<typeof setPayoutMethodSchema>;

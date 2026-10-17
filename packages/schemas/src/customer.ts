import { z } from 'zod';

import { reservationStatusSchema } from './reservation';
import { retentionStatusSchema } from './retention';

/**
 * A-Customers read model: the operations desk's account list. The profile adds
 * the customer's trips. Passport numbers, preferences and OFAC records wait for
 * M2/M3, so they are not part of this DTO.
 */
export const customerTripSchema = z.object({
  id: z.string().uuid(),
  bookingCode: z.string(),
  packageName: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  status: reservationStatusSchema,
  totalAmount: z.string(),
  totalCurrency: z.string(),
  /** US persons on the trip, and those still without an OFAC affidavit (M3). */
  ofacRequired: z.number().int().nonnegative(),
  ofacMissing: z.number().int().nonnegative(),
});

export type CustomerTripDto = z.infer<typeof customerTripSchema>;

export const customerSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().nullable(),
  email: z.string().email(),
  phone: z.string().nullable(),
  nationality: z.string().nullable(),
  tripCount: z.number().int().nonnegative(),
  /** The most recent reservation's creation time, or null with no trips. */
  lastReservationAt: z.string().nullable(),
  /** The latest COMPLETED trip, the anchor of the retention clock. */
  latestCompletedAt: z.string().nullable(),
  retentionStatus: retentionStatusSchema,
});

export type CustomerDto = z.infer<typeof customerSchema>;

export const customerDetailSchema = customerSchema.extend({
  createdAt: z.string(),
  trips: z.array(customerTripSchema),
});

export type CustomerDetailDto = z.infer<typeof customerDetailSchema>;

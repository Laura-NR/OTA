import { z } from 'zod';

import { reservationServiceItemSchema, reservationStatusSchema } from './reservation';

/** The signed-in traveler's own profile (storefront self-service). */
export const meProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().nullable(),
  role: z.string(),
  locale: z.string(),
});

export type MeProfileDto = z.infer<typeof meProfileSchema>;

/** A traveler-safe document reference: no storage key or internal path. */
export const myDocumentSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  generatedAt: z.string(),
});

export type MyDocumentDto = z.infer<typeof myDocumentSchema>;

export const myReservationListItemSchema = z.object({
  id: z.string().uuid(),
  bookingCode: z.string(),
  status: reservationStatusSchema,
  startDate: z.string(),
  endDate: z.string(),
  totalCurrency: z.string(),
  totalAmount: z.string(),
  serviceItemCount: z.number().int().nonnegative(),
  documentCount: z.number().int().nonnegative(),
});

export type MyReservationListItemDto = z.infer<typeof myReservationListItemSchema>;

export const myReservationDetailSchema = myReservationListItemSchema.extend({
  serviceItems: z.array(reservationServiceItemSchema),
  documents: z.array(myDocumentSchema),
});

export type MyReservationDetailDto = z.infer<typeof myReservationDetailSchema>;

/**
 * A traveler-built itinerary (spec §4.2 / storefront dynamic package builder).
 * The server derives each service item's type, province, and price from the
 * catalog item so the client cannot set them.
 */
export const createMyReservationSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    serviceItems: z
      .array(
        z.object({
          inventoryItemId: z.string().uuid(),
          serviceDateStart: z.coerce.date().optional(),
          serviceDateEnd: z.coerce.date().optional(),
        }),
      )
      .min(1)
      .max(20),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });

export type CreateMyReservationRequest = z.infer<typeof createMyReservationSchema>;

import { z } from 'zod';

import { nationalitySchema } from './regulatory';
import { reservationServiceItemSchema, reservationStatusSchema } from './reservation';
import { myReviewSchema } from './review';

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

/** The package a trip was booked from, in the requested locale where translated. */
export const myTripSchema = z.object({
  name: z.string(),
  /** The chosen tier's name, or null when the booking has none. */
  tier: z.string().nullable(),
});

/** Where the provider requests stand (the dispatch ledger, no provider named). */
export const providerProgressSchema = z.object({
  services: z.number().int(),
  confirmed: z.number().int(),
  awaiting: z.number().int(),
  arranging: z.number().int(),
  requestsSent: z.number().int(),
  answered: z.number().int(),
});

export type ProviderProgressDto = z.infer<typeof providerProgressSchema>;

/** A member of the travel party, by name only (no passport or birth date). */
export const myTravelerSchema = z.object({
  fullName: z.string(),
  isLead: z.boolean(),
});

export const myReservationDetailSchema = myReservationListItemSchema.extend({
  serviceItems: z.array(reservationServiceItemSchema),
  documents: z.array(myDocumentSchema),
  /** The caller's CSAT review, when the trip has been reviewed. */
  review: myReviewSchema.nullable(),
  /** Null for a custom trip (builder or accepted proposal). */
  trip: myTripSchema.nullable(),
  travelers: z.array(myTravelerSchema),
  providers: providerProgressSchema,
});

export type MyReservationDetailDto = z.infer<typeof myReservationDetailSchema>;

/** `GET /me/reservations/:id?locale=` picks the package's published translation. */
export const myReservationQuerySchema = z.object({
  locale: z.string().trim().min(2).max(5).optional(),
});

export type MyReservationQuery = z.infer<typeof myReservationQuerySchema>;

/**
 * A traveler-built itinerary (spec §4.2 / storefront dynamic package builder).
 * The server derives each service item's type, province, and price from the
 * catalog item so the client cannot set them.
 */
export const createMyReservationSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    /** Optional traveler nationality to record for statutory reporting (§4.9.2). */
    nationality: nationalitySchema.optional(),
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

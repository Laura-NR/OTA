import {
  RESERVATION_STATUSES,
  ServiceItemStatus,
  ServiceType,
  type ReservationStatus,
} from '@ota/domain';
import { z } from 'zod';

import { nationalitySchema, tourismCategorySchema } from './regulatory';

/**
 * Reservation status as accepted over the wire. Derived from the canonical
 * domain list so the two can never drift.
 */
export const reservationStatusSchema = z.enum(
  RESERVATION_STATUSES as [ReservationStatus, ...ReservationStatus[]],
);

export const transitionReservationSchema = z.object({
  to: reservationStatusSchema,
  reason: z.string().trim().max(500).optional(),
});

export type TransitionReservationRequest = z.infer<typeof transitionReservationSchema>;

export const listReservationsQuerySchema = z.object({
  status: reservationStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListReservationsQuery = z.infer<typeof listReservationsQuerySchema>;

export const reservationSchema = z.object({
  id: z.string().uuid(),
  bookingCode: z.string(),
  status: reservationStatusSchema,
  tourismCategory: tourismCategorySchema,
  startDate: z.string(),
  endDate: z.string(),
  totalCurrency: z.string(),
  totalAmount: z.string(),
  createdAt: z.string(),
});

export type ReservationDto = z.infer<typeof reservationSchema>;

/** Ops-created booking. The storefront builder will adopt the same payload. */
export const createReservationSchema = z.object({
  travelerEmail: z.string().email(),
  /** Optional traveler nationality to record for statutory reporting (§4.9.2). */
  nationality: nationalitySchema.optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  totalCurrency: z.string().trim().length(3).default('EUR'),
  totalAmount: z.coerce.number().nonnegative().default(0),
  tourismCategory: tourismCategorySchema.optional(),
  customItineraryPayload: z.record(z.string(), z.unknown()).optional(),
});

export type CreateReservationRequest = z.infer<typeof createReservationSchema>;

/** Pipeline list row: the reservation plus the operator-relevant context. */
export const reservationListItemSchema = reservationSchema.extend({
  travelerEmail: z.string().email(),
  travelerName: z.string().nullable(),
  serviceItemCount: z.number().int().nonnegative(),
});

export type ReservationListItemDto = z.infer<typeof reservationListItemSchema>;

export const reservationServiceItemSchema = z.object({
  id: z.string().uuid(),
  serviceType: z.enum([
    ServiceType.Guide,
    ServiceType.Transportation,
    ServiceType.Accommodation,
    ServiceType.Experience,
  ]),
  status: z.enum([
    ServiceItemStatus.Unassigned,
    ServiceItemStatus.Offered,
    ServiceItemStatus.Accepted,
    ServiceItemStatus.Declined,
    ServiceItemStatus.Timeout,
    ServiceItemStatus.Fulfilled,
  ]),
  province: z.string().nullable(),
  serviceDateStart: z.string(),
  serviceDateEnd: z.string(),
  supplierId: z.string().uuid().nullable(),
});

export type ReservationServiceItemDto = z.infer<typeof reservationServiceItemSchema>;

export const reservationDetailSchema = reservationListItemSchema.extend({
  travelerId: z.string().uuid(),
  serviceItems: z.array(reservationServiceItemSchema),
});

export type ReservationDetailDto = z.infer<typeof reservationDetailSchema>;

export const auditLogEntrySchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  actorEmail: z.string().email().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string(),
});

export type AuditLogEntryDto = z.infer<typeof auditLogEntrySchema>;

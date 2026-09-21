import { RESERVATION_STATUSES, type ReservationStatus } from '@ota/domain';
import { z } from 'zod';

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
  startDate: z.string(),
  endDate: z.string(),
  totalCurrency: z.string(),
  totalAmount: z.string(),
  createdAt: z.string(),
});

export type ReservationDto = z.infer<typeof reservationSchema>;

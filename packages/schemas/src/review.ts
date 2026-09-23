import { z } from 'zod';

/**
 * Traveler CSAT review (spec §4.9.4). The `Review` model already exists; this
 * adds the submission and read surfaces.
 */
export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});

export type CreateReviewRequest = z.infer<typeof createReviewSchema>;

/** Traveler-safe review shape (no internal identifiers beyond its own id). */
export const myReviewSchema = z.object({
  id: z.string().uuid(),
  rating: z.number().int(),
  comment: z.string().nullable(),
  createdAt: z.string(),
});

export type MyReviewDto = z.infer<typeof myReviewSchema>;

export const reviewSchema = myReviewSchema.extend({
  reservationId: z.string().uuid(),
  bookingCode: z.string(),
});

export type ReviewDto = z.infer<typeof reviewSchema>;

export const listReviewsQuerySchema = z.object({
  reservationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;

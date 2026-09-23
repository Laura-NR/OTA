import { TOURISM_CATEGORIES, type TourismCategory } from '@ota/domain';
import { z } from 'zod';

/** Canonical tourism classification, derived from the domain so they can't drift. */
export const tourismCategorySchema = z.enum(
  TOURISM_CATEGORIES as [TourismCategory, ...TourismCategory[]],
);

export type TourismCategoryDto = z.infer<typeof tourismCategorySchema>;

/** ISO 3166-1 alpha-2, stored upper-case (spec §4.9.2 nationality breakdown). */
export const nationalitySchema = z
  .string()
  .trim()
  .length(2)
  .transform((value) => value.toUpperCase());

/** Optional reporting window; both bounds inclusive when present. */
export const regulatoryRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type RegulatoryRangeQuery = z.infer<typeof regulatoryRangeSchema>;

const categoryCountSchema = z.object({
  category: z.string(),
  count: z.number().int(),
  ratio: z.number(),
});

const nationalityCountSchema = z.object({
  nationality: z.string(),
  count: z.number().int(),
});

const circuitCountSchema = z.object({
  province: z.string(),
  count: z.number().int(),
});

export const regulatorySummarySchema = z.object({
  range: z.object({ from: z.string().nullable(), to: z.string().nullable() }),
  bookings: z.number().int(),
  travelers: z.number().int(),
  bedNights: z.number().int(),
  specialisedRatio: z.number(),
  byCategory: z.array(categoryCountSchema),
  nationalities: z.array(nationalityCountSchema),
  circuits: z.array(circuitCountSchema),
});

export type RegulatorySummaryDto = z.infer<typeof regulatorySummarySchema>;

/** Operator classification of an existing booking (spec §4.9.2). */
export const classifyReservationSchema = z.object({
  tourismCategory: tourismCategorySchema,
});

export type ClassifyReservationRequest = z.infer<typeof classifyReservationSchema>;

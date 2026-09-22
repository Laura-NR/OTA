import { z } from 'zod';

/** Optional reporting window; both bounds inclusive when present. */
export const analyticsRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeSchema>;

const railTotalSchema = z.object({
  rail: z.string(),
  amount: z.number(),
  count: z.number().int(),
});

const financeSchema = z.object({
  gbv: z.number(),
  payoutsAccrued: z.number(),
  payoutsSettled: z.number(),
  netRevenue: z.number(),
  takeRate: z.number(),
  averageOrderValue: z.number(),
  paidCount: z.number().int(),
  byRail: z.array(railTotalSchema),
});

const operationsSchema = z.object({
  offers: z.number().int(),
  accepted: z.number().int(),
  declined: z.number().int(),
  timedOut: z.number().int(),
  pending: z.number().int(),
  acceptanceRate: z.number(),
  timeoutRate: z.number(),
  averageResponseMinutes: z.number(),
  funnel: z.array(z.object({ status: z.string(), count: z.number().int() })),
});

const qualitySchema = z.object({
  reviewCount: z.number().int(),
  averageRating: z.number(),
  incidentCount: z.number().int(),
});

const geographySchema = z.array(
  z.object({ province: z.string(), count: z.number().int() }),
);

export const analyticsOverviewSchema = z.object({
  range: z.object({ from: z.string().nullable(), to: z.string().nullable() }),
  finance: financeSchema,
  operations: operationsSchema,
  quality: qualitySchema,
  geography: geographySchema,
});

export type AnalyticsOverviewDto = z.infer<typeof analyticsOverviewSchema>;

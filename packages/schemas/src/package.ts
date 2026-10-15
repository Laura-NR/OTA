import { z } from 'zod';

import { inventoryTypeSchema } from './inventory';
import { nationalitySchema } from './regulatory';

/** Publish lifecycle of a curated package (M1 / A-Package-Edit). */
export const packageStatusSchema = z.enum([
  'DRAFT',
  'IN_REVIEW',
  'PUBLISHED',
  'ARCHIVED',
]);

export type PackageStatusDto = z.infer<typeof packageStatusSchema>;

/**
 * One catalog item inside a package itinerary, joined with the catalog summary
 * the storefront needs to render it (spec §3.3).
 */
export const packageServiceSchema = z.object({
  id: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  dayOffset: z.number().int(),
  position: z.number().int(),
  itemName: z.string(),
  itemType: inventoryTypeSchema,
  itemProvince: z.string().nullable(),
  itemBasePrice: z.string(),
  itemCurrency: z.string(),
  itemMediaId: z.string().uuid().nullable(),
});

export type PackageServiceDto = z.infer<typeof packageServiceSchema>;

/** One itinerary day's words (M1), keyed by its dayOffset. */
export const packageDaySchema = z.object({
  id: z.string().uuid(),
  dayOffset: z.number().int(),
  title: z.string(),
  body: z.string().nullable(),
  meals: z.string().nullable(),
});

export type PackageDayDto = z.infer<typeof packageDaySchema>;

/** An accommodation tier: a delta over the departure price. */
export const packageTierSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  position: z.number().int(),
  priceDelta: z.string(),
  singleSupplement: z.string().nullable(),
  isDefault: z.boolean(),
});

export type PackageTierDto = z.infer<typeof packageTierSchema>;

/** A fixed departure; `price` null falls back to the package base price. */
export const packageDepartureSchema = z.object({
  id: z.string().uuid(),
  startDate: z.string(),
  capacity: z.number().int(),
  price: z.string().nullable(),
  status: z.enum(['OPEN', 'CLOSED', 'CANCELLED']),
});

export type PackageDepartureDto = z.infer<typeof packageDepartureSchema>;

/** An optional add-on, priced per person or per booking. */
export const packageExtraSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  durationLabel: z.string().nullable(),
  dayOffset: z.number().int().nullable(),
  price: z.string(),
  priceUnit: z.enum(['PER_PERSON', 'PER_BOOKING']),
  position: z.number().int(),
  active: z.boolean(),
});

export type PackageExtraDto = z.infer<typeof packageExtraSchema>;

/** A package photo's metadata; the binary is served from storage. */
export const packageMediaSchema = z.object({
  id: z.string().uuid(),
  altText: z.string(),
  position: z.number().int(),
  showsPeople: z.boolean(),
});

export type PackageMediaDto = z.infer<typeof packageMediaSchema>;

export const packageSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  summary: z.string().nullable(),
  province: z.string().nullable(),
  durationDays: z.number().int(),
  currency: z.string(),
  basePrice: z.string(),
  status: packageStatusSchema,
  publishedAt: z.string().nullable(),
  bookingModel: z.enum(['REQUEST', 'INSTANT']),
  groupMin: z.number().int().nullable(),
  groupMax: z.number().int().nullable(),
  leadTimeDays: z.number().int(),
  tourismCategory: z.string(),
  themes: z.array(z.string()),
  difficulty: z.number().int().nullable(),
  accessibility: z.array(z.string()),
  cancellationPolicy: z.string().nullable(),
  depositPolicy: z.string().nullable(),
  included: z.array(z.string()),
  excluded: z.array(z.string()),
  cubaNotes: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  services: z.array(packageServiceSchema),
  days: z.array(packageDaySchema),
  tiers: z.array(packageTierSchema),
  departures: z.array(packageDepartureSchema),
  extras: z.array(packageExtraSchema),
  media: z.array(packageMediaSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PackageDto = z.infer<typeof packageSchema>;

const packageServiceInputSchema = z.object({
  inventoryItemId: z.string().uuid(),
  dayOffset: z.coerce.number().int().min(0).max(60).default(0),
  position: z.coerce.number().int().min(0).max(100).default(0),
});

export const createPackageSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lower-case kebab-case')
    .optional(),
  description: z.string().trim().max(2000).optional(),
  province: z.string().trim().min(1).max(100).optional(),
  durationDays: z.coerce.number().int().min(1).max(60),
  currency: z.string().trim().length(3).default('EUR'),
  basePrice: z.coerce.number().nonnegative(),
  status: packageStatusSchema.optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  services: z.array(packageServiceInputSchema).min(1).max(40),
});

export type CreatePackageRequest = z.infer<typeof createPackageSchema>;

/** Fields only; `services`, when present, replaces the itinerary wholesale. */
export const updatePackageSchema = createPackageSchema.partial();

export type UpdatePackageRequest = z.infer<typeof updatePackageSchema>;

export const listPackagesQuerySchema = z.object({
  province: z.string().trim().min(1).optional(),
  status: packageStatusSchema.optional(),
});

export type ListPackagesQuery = z.infer<typeof listPackagesQuerySchema>;

/** A traveler books a curated package for a date range (spec §3.3). */
export const createPackageBookingSchema = z
  .object({
    packageId: z.string().uuid(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    /** Optional traveler nationality to record for statutory reporting (§4.9.2). */
    nationality: nationalitySchema.optional(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });

export type CreatePackageBookingRequest = z.infer<typeof createPackageBookingSchema>;

import { z } from 'zod';

import { inventoryTypeSchema } from './inventory';
import { nationalitySchema, tourismCategorySchema } from './regulatory';

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
  /**
   * A stay's backup power (M6 D6(b)), derived from its casa's confirmation
   * when that is fresh; null otherwise and for anything but a casa.
   */
  backupPower: z
    .object({
      kind: z.enum(['SOLAR', 'GENERATOR']),
      hoursPerDay: z.number().int().nullable(),
    })
    .nullable(),
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
  /** A consent reference is on file (the reference itself stays internal). */
  hasConsent: z.boolean(),
});

export type PackageMediaDto = z.infer<typeof packageMediaSchema>;

/** Upload one package photo; the binary is stored and the row keeps its alt. */
export const packageMediaUploadSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  contentBase64: z.string().min(1),
  altText: z.string().trim().min(1).max(300),
  showsPeople: z.boolean().default(false),
  consentReference: z.string().trim().max(200).optional(),
});

export type PackageMediaUploadRequest = z.infer<typeof packageMediaUploadSchema>;

/** One locale's overlay of a package's words (M1, D1). */
export const packageTranslationSchema = z.object({
  id: z.string().uuid(),
  locale: z.string(),
  name: z.string().nullable(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
  included: z.array(z.string()),
  excluded: z.array(z.string()),
  cubaNotes: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  days: z.unknown().nullable(),
  tiers: z.unknown().nullable(),
  extras: z.unknown().nullable(),
  mediaAlt: z.unknown().nullable(),
  published: z.boolean(),
  sourceUpdatedAt: z.string(),
});

export type PackageTranslationDto = z.infer<typeof packageTranslationSchema>;

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
  /** The locale of the base text; translations overlay the others. */
  sourceLocale: z.string(),
  /** When the source text last changed; an older translation is outdated. */
  contentUpdatedAt: z.string(),
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
  /** Every stay claims backup power (the storefront filter, M6 D6(b)). */
  backupPower: z.boolean(),
  days: z.array(packageDaySchema),
  tiers: z.array(packageTierSchema),
  departures: z.array(packageDepartureSchema),
  extras: z.array(packageExtraSchema),
  media: z.array(packageMediaSchema),
  translations: z.array(packageTranslationSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PackageDto = z.infer<typeof packageSchema>;

const packageServiceInputSchema = z.object({
  inventoryItemId: z.string().uuid(),
  dayOffset: z.coerce.number().int().min(0).max(60).default(0),
  position: z.coerce.number().int().min(0).max(100).default(0),
});

/** M1 sub-resource inputs; each list, when present, replaces the collection. */
const packageTierInputSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  position: z.coerce.number().int().min(0).max(100).default(0),
  priceDelta: z.coerce.number().default(0),
  singleSupplement: z.coerce.number().nonnegative().nullable().optional(),
  isDefault: z.boolean().default(false),
});

const packageDepartureInputSchema = z.object({
  startDate: z.coerce.date(),
  capacity: z.coerce.number().int().min(1).max(1000),
  price: z.coerce.number().nonnegative().nullable().optional(),
  status: z.enum(['OPEN', 'CLOSED', 'CANCELLED']).default('OPEN'),
});

const packageExtraInputSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  durationLabel: z.string().trim().max(100).optional(),
  inventoryItemId: z.string().uuid().optional(),
  dayOffset: z.coerce.number().int().min(0).max(60).optional(),
  price: z.coerce.number().nonnegative(),
  priceUnit: z.enum(['PER_PERSON', 'PER_BOOKING']).default('PER_PERSON'),
  position: z.coerce.number().int().min(0).max(100).default(0),
  active: z.boolean().default(true),
});

const packageDayInputSchema = z.object({
  dayOffset: z.coerce.number().int().min(0).max(60),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(4000).optional(),
  meals: z.string().trim().max(200).optional(),
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
  summary: z.string().trim().max(400).optional(),
  province: z.string().trim().min(1).max(100).optional(),
  durationDays: z.coerce.number().int().min(1).max(60),
  currency: z.string().trim().length(3).default('EUR'),
  basePrice: z.coerce.number().nonnegative(),
  status: packageStatusSchema.optional(),
  bookingModel: z.enum(['REQUEST', 'INSTANT']).default('REQUEST'),
  groupMin: z.coerce.number().int().min(1).max(100).nullable().optional(),
  groupMax: z.coerce.number().int().min(1).max(100).nullable().optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).default(2),
  tourismCategory: tourismCategorySchema.optional(),
  themes: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  difficulty: z.coerce.number().int().min(1).max(5).nullable().optional(),
  accessibility: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  cancellationPolicy: z.string().trim().max(100).nullable().optional(),
  depositPolicy: z.string().trim().max(100).nullable().optional(),
  included: z.array(z.string().trim().max(200)).max(50).optional(),
  excluded: z.array(z.string().trim().max(200)).max(50).optional(),
  cubaNotes: z.string().trim().max(4000).optional(),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(400).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  services: z.array(packageServiceInputSchema).min(1).max(40),
  tiers: z.array(packageTierInputSchema).max(20).optional(),
  departures: z.array(packageDepartureInputSchema).max(365).optional(),
  extras: z.array(packageExtraInputSchema).max(50).optional(),
  days: z.array(packageDayInputSchema).max(60).optional(),
});

export type CreatePackageRequest = z.infer<typeof createPackageSchema>;

/** Fields only; `services`, when present, replaces the itinerary wholesale. */
export const updatePackageSchema = createPackageSchema.partial();

export type UpdatePackageRequest = z.infer<typeof updatePackageSchema>;

/** One locale's overlay of a package's words (M1, D1). */
export const putPackageTranslationSchema = z.object({
  name: z.string().trim().max(200).nullable().optional(),
  summary: z.string().trim().max(400).nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  included: z.array(z.string().trim().max(200)).max(50).optional(),
  excluded: z.array(z.string().trim().max(200)).max(50).optional(),
  cubaNotes: z.string().trim().max(4000).nullable().optional(),
  seoTitle: z.string().trim().max(200).nullable().optional(),
  seoDescription: z.string().trim().max(400).nullable().optional(),
  days: z.record(z.string(), z.unknown()).optional(),
  tiers: z.record(z.string(), z.unknown()).optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
  mediaAlt: z.record(z.string(), z.unknown()).optional(),
  published: z.boolean().optional(),
});

export type PutPackageTranslationRequest = z.infer<typeof putPackageTranslationSchema>;

export const listPackagesQuerySchema = z.object({
  province: z.string().trim().min(1).optional(),
  status: packageStatusSchema.optional(),
  /** Public reads overlay this locale's published translation (M1, D1). */
  locale: z.string().trim().min(2).max(5).optional(),
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

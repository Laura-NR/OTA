import { z } from 'zod';

import { inventoryTypeSchema } from './inventory';
import { nationalitySchema } from './regulatory';

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

export const packageSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  province: z.string().nullable(),
  durationDays: z.number().int(),
  currency: z.string(),
  basePrice: z.string(),
  active: z.boolean(),
  services: z.array(packageServiceSchema),
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
  active: z.boolean().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  services: z.array(packageServiceInputSchema).min(1).max(40),
});

export type CreatePackageRequest = z.infer<typeof createPackageSchema>;

/** Fields only; `services`, when present, replaces the itinerary wholesale. */
export const updatePackageSchema = createPackageSchema.partial();

export type UpdatePackageRequest = z.infer<typeof updatePackageSchema>;

export const listPackagesQuerySchema = z.object({
  province: z.string().trim().min(1).optional(),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
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

import { PricingRuleKind } from '@ota/domain';
import { z } from 'zod';

export const inventoryTypeSchema = z.enum(['ACCOMMODATION', 'TRANSPORT', 'EXPERIENCE']);

export const pricingRuleKindSchema = z.enum([
  PricingRuleKind.SeasonalRate,
  PricingRuleKind.Markup,
]);

export const createInventoryItemSchema = z.object({
  type: inventoryTypeSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  province: z.string().trim().min(1).optional(),
  currency: z.string().trim().length(3).default('EUR'),
  basePrice: z.coerce.number().nonnegative(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  supplierId: z.string().uuid().optional(),
});

export type CreateInventoryItemRequest = z.infer<typeof createInventoryItemSchema>;

export const updateInventoryItemSchema = createInventoryItemSchema
  .partial()
  .extend({ active: z.boolean().optional() });

export type UpdateInventoryItemRequest = z.infer<typeof updateInventoryItemSchema>;

export const listInventoryQuerySchema = z.object({
  type: inventoryTypeSchema.optional(),
  province: z.string().trim().min(1).optional(),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;

/** The public catalog exposes only active items; callers may filter by type and
 * province but cannot see inactive ones (spec §4.6 storefront control). */
export const listCatalogQuerySchema = z.object({
  type: inventoryTypeSchema.optional(),
  province: z.string().trim().min(1).optional(),
});

export type ListCatalogQuery = z.infer<typeof listCatalogQuerySchema>;

/** Catalog images are served inline; PDFs and other documents are not media. */
export const mediaContentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);

export const inventoryMediaSchema = z.object({
  id: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  altText: z.string().nullable(),
  position: z.number().int(),
  contentType: z.string().nullable(),
  createdAt: z.string(),
});

export type InventoryMediaDto = z.infer<typeof inventoryMediaSchema>;

export const uploadInventoryMediaSchema = z.object({
  contentType: mediaContentTypeSchema,
  contentBase64: z.string().min(1),
  altText: z.string().trim().max(300).optional(),
});

export type UploadInventoryMediaRequest = z.infer<typeof uploadInventoryMediaSchema>;

const pricingRuleInputSchema = z.object({
  kind: pricingRuleKindSchema,
  label: z.string().trim().min(1).max(200),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  amount: z.coerce.number().nonnegative().optional(),
  percent: z.coerce.number().nonnegative().max(100).optional(),
});

export const createPricingRuleSchema = pricingRuleInputSchema.refine(
  (rule) =>
    (rule.kind === PricingRuleKind.SeasonalRate && rule.amount !== undefined) ||
    (rule.kind === PricingRuleKind.Markup && rule.percent !== undefined),
  { message: 'SEASONAL_RATE requires amount; MARKUP requires percent' },
);

export type CreatePricingRuleRequest = z.infer<typeof createPricingRuleSchema>;

export const updatePricingRuleSchema = pricingRuleInputSchema
  .partial()
  .extend({ active: z.boolean().optional() });

export type UpdatePricingRuleRequest = z.infer<typeof updatePricingRuleSchema>;

export const pricingRuleSchema = z.object({
  id: z.string().uuid(),
  inventoryItemId: z.string().uuid().nullable(),
  kind: pricingRuleKindSchema,
  label: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  amount: z.string().nullable(),
  percent: z.string().nullable(),
  active: z.boolean(),
});

export type PricingRuleDto = z.infer<typeof pricingRuleSchema>;

export const inventoryItemSchema = z.object({
  id: z.string().uuid(),
  type: inventoryTypeSchema,
  name: z.string(),
  description: z.string().nullable(),
  province: z.string().nullable(),
  currency: z.string(),
  basePrice: z.string(),
  active: z.boolean(),
  supplierId: z.string().uuid().nullable(),
  media: z.array(inventoryMediaSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type InventoryItemDto = z.infer<typeof inventoryItemSchema>;

export const priceQuoteSchema = z.object({
  base: z.number(),
  seasonal: z.number(),
  markup: z.number(),
  total: z.number(),
});

export type PriceQuoteDto = z.infer<typeof priceQuoteSchema>;

export const priceQuoteQuerySchema = z.object({
  date: z.coerce.date(),
});

export type PriceQuoteQuery = z.infer<typeof priceQuoteQuerySchema>;

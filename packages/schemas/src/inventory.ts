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

export const createPricingRuleSchema = z
  .object({
    kind: pricingRuleKindSchema,
    label: z.string().trim().min(1).max(200),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    amount: z.coerce.number().nonnegative().optional(),
    percent: z.coerce.number().nonnegative().max(100).optional(),
  })
  .refine(
    (rule) =>
      (rule.kind === PricingRuleKind.SeasonalRate && rule.amount !== undefined) ||
      (rule.kind === PricingRuleKind.Markup && rule.percent !== undefined),
    { message: 'SEASONAL_RATE requires amount; MARKUP requires percent' },
  );

export type CreatePricingRuleRequest = z.infer<typeof createPricingRuleSchema>;

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

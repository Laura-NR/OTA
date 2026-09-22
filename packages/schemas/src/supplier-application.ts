import { z } from 'zod';

import { supplierCategorySchema } from './supplier';

export const supplierApplicationStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
]);

export const createSupplierApplicationSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().email(),
  phone: z.string().trim().min(1).max(40),
  category: supplierCategorySchema,
  provincesActive: z.array(z.string().trim().min(1)).min(1).max(16),
  rtnLicenseNumber: z.string().trim().min(1).max(100),
  message: z.string().trim().max(2000).optional(),
});

export type CreateSupplierApplicationRequest = z.infer<
  typeof createSupplierApplicationSchema
>;

export const supplierApplicationSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
  phone: z.string(),
  category: supplierCategorySchema,
  provincesActive: z.array(z.string()),
  rtnLicenseNumber: z.string(),
  message: z.string().nullable(),
  status: supplierApplicationStatusSchema,
  createdAt: z.string(),
  reviewedAt: z.string().nullable(),
});

export type SupplierApplicationDto = z.infer<typeof supplierApplicationSchema>;

export const listSupplierApplicationsQuerySchema = z.object({
  status: supplierApplicationStatusSchema.optional(),
});

export type ListSupplierApplicationsQuery = z.infer<
  typeof listSupplierApplicationsQuerySchema
>;

export const reviewSupplierApplicationSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export type ReviewSupplierApplicationRequest = z.infer<
  typeof reviewSupplierApplicationSchema
>;

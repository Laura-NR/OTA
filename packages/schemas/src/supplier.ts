import { SupplierCategory, VerificationStatus } from '@ota/domain';
import { z } from 'zod';

export const supplierCategorySchema = z.enum([
  SupplierCategory.TourGuide,
  SupplierCategory.PrivateDriver,
  SupplierCategory.HomestayHost,
  SupplierCategory.Translator,
]);

export const verificationStatusSchema = z.enum([
  VerificationStatus.PendingAudit,
  VerificationStatus.Verified,
  VerificationStatus.Rejected,
  VerificationStatus.Suspended,
]);

export const listSuppliersQuerySchema = z.object({
  status: verificationStatusSchema.optional(),
  province: z.string().trim().min(1).optional(),
});

export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;

export const setVerificationSchema = z.object({
  status: verificationStatusSchema,
  reason: z.string().trim().max(500).optional(),
});

export type SetVerificationRequest = z.infer<typeof setVerificationSchema>;

export const supplierSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  fullName: z.string().nullable(),
  email: z.string().email(),
  category: supplierCategorySchema,
  primaryPhone: z.string(),
  provincesActive: z.array(z.string()),
  rtnLicenseNumber: z.string(),
  verificationStatus: verificationStatusSchema,
  isAvailable: z.boolean(),
  credentialExpiresAt: z.string().nullable(),
});

export type SupplierDto = z.infer<typeof supplierSchema>;

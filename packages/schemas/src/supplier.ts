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
  hasCredential: z.boolean(),
  credentialContentType: z.string().nullable(),
});

export type SupplierDto = z.infer<typeof supplierSchema>;

/** Credential images are shown inline; PDFs are linked. Kept in sync with the
 * key extension so the DTO can report the type without a schema column. */
export const credentialContentTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export const uploadCredentialSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: credentialContentTypeSchema,
  contentBase64: z.string().min(1),
  expiresAt: z.coerce.date().optional(),
});

export type UploadCredentialRequest = z.infer<typeof uploadCredentialSchema>;

export const expiringSuppliersQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export type ExpiringSuppliersQuery = z.infer<typeof expiringSuppliersQuerySchema>;

/** Availability calendar window (spec §5.2). Bounds are inclusive. */
export const availabilityQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const availabilityDaySchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  date: z.string(),
  isAvailable: z.boolean(),
});

export type AvailabilityDayDto = z.infer<typeof availabilityDaySchema>;

export const setAvailabilitySchema = z.object({
  date: z.coerce.date(),
  isAvailable: z.boolean(),
});

export type SetAvailabilityRequest = z.infer<typeof setAvailabilitySchema>;

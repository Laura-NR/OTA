import { z } from 'zod';

/**
 * GDPR retention lifecycle (spec §3.5): a read model for the operations desk and
 * the result of a manual scan. The lifecycle itself is a scheduled worker.
 */
export const retentionStatusSchema = z.enum([
  'ACTIVE',
  'NOTICE_DUE',
  'GRACE_PERIOD',
  'PURGE_DUE',
  'ANONYMIZED',
]);

export type RetentionStatusDto = z.infer<typeof retentionStatusSchema>;

export const retentionPendingUserSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email().nullable(),
  fullName: z.string().nullable(),
  status: retentionStatusSchema,
  latestCompletedAt: z.string().nullable(),
  noticeSentAt: z.string().nullable(),
  consentGrantedAt: z.string().nullable(),
  /** Anonymization date: the grace deadline, or the actual anonymization date. */
  purgeAt: z.string().nullable(),
});

export type RetentionPendingUserDto = z.infer<typeof retentionPendingUserSchema>;

export const listRetentionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type ListRetentionQuery = z.infer<typeof listRetentionQuerySchema>;

export const retentionScanResultSchema = z.object({
  noticed: z.number().int(),
  purged: z.number().int(),
});

export type RetentionScanResultDto = z.infer<typeof retentionScanResultSchema>;

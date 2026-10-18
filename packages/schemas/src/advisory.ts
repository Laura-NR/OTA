import {
  ADVISORY_SEVERITIES,
  ADVISORY_STATUSES,
  type AdvisoryDisplayStatus,
  type AdvisorySeverity,
  type AdvisoryStatus,
} from '@ota/domain';
import { z } from 'zod';

/** M7 travel advisories (`docs/schema-m7-advisories.md`). */

export const advisorySeveritySchema = z.enum([...ADVISORY_SEVERITIES] as [
  AdvisorySeverity,
  ...AdvisorySeverity[],
]);

export const advisoryStatusSchema = z.enum([...ADVISORY_STATUSES] as [
  AdvisoryStatus,
  ...AdvisoryStatus[],
]);

export const advisoryDisplayStatusSchema = z.enum([
  ...ADVISORY_STATUSES,
  'SCHEDULED',
  'EXPIRED',
] as [AdvisoryDisplayStatus, ...AdvisoryDisplayStatus[]]);

const localeSchema = z.string().trim().min(2).max(10);

export const advisoryTranslationInputSchema = z.object({
  locale: localeSchema,
  headline: z.string().trim().min(1).max(160),
  /** What happened, why, what to do. */
  body: z.string().trim().min(1).max(2000),
  cta: z.string().trim().min(1).max(80).nullable().optional(),
});

export type AdvisoryTranslationInput = z.infer<typeof advisoryTranslationInputSchema>;

/**
 * An advisory's editable document. Creating a draft and saving it (PATCH)
 * both send the whole document, translations included, which replace what was
 * stored. Regions are province codes; an empty list is the whole country.
 */
export const advisoryWriteSchema = z
  .object({
    severity: advisorySeveritySchema,
    regions: z
      .array(z.string().regex(/^CU\d{2}$/))
      .max(16)
      .transform((codes) => [...new Set(codes)]),
    effectiveFrom: z.coerce.date(),
    expiresAt: z.coerce.date(),
    source: z.string().trim().min(1).max(300),
    sourceLocale: localeSchema,
    showOnSite: z.boolean(),
    showOnPackages: z.boolean(),
    notifyTravelers: z.boolean(),
    translations: z.array(advisoryTranslationInputSchema).min(1).max(10),
  })
  .refine((value) => value.expiresAt > value.effectiveFrom, {
    message: 'expiresAt must be after effectiveFrom',
    path: ['expiresAt'],
  })
  .refine(
    (value) =>
      new Set(value.translations.map((item) => item.locale)).size ===
      value.translations.length,
    { message: 'one translation per locale', path: ['translations'] },
  )
  .refine(
    (value) => value.translations.some((item) => item.locale === value.sourceLocale),
    { message: 'the source locale needs a translation', path: ['translations'] },
  );

export type AdvisoryWriteRequest = z.infer<typeof advisoryWriteSchema>;

export const advisoryRequestChangesSchema = z.object({
  note: z.string().trim().min(1).max(500),
});

export type AdvisoryRequestChangesRequest = z.infer<typeof advisoryRequestChangesSchema>;

export const advisoryLiftSchema = z.object({
  note: z.string().trim().min(1).max(500).optional(),
});

export type AdvisoryLiftRequest = z.infer<typeof advisoryLiftSchema>;

export const advisoryListQuerySchema = z.object({
  status: advisoryDisplayStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type AdvisoryListQuery = z.infer<typeof advisoryListQuerySchema>;

export const advisoryTranslationSchema = z.object({
  locale: z.string(),
  headline: z.string(),
  body: z.string(),
  cta: z.string().nullable(),
});

export type AdvisoryTranslationDto = z.infer<typeof advisoryTranslationSchema>;

export const advisoryApprovalSchema = z.object({
  approverId: z.string().uuid().nullable(),
  approverName: z.string().nullable(),
  role: z.string(),
  createdAt: z.string(),
});

export type AdvisoryApprovalDto = z.infer<typeof advisoryApprovalSchema>;

const approvalNeedSchema = z.enum(['APPROVER', 'OPERATIONS_ADMIN', 'SUPER_ADMIN']);

export const advisoryListItemSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  severity: advisorySeveritySchema,
  status: advisoryStatusSchema,
  displayStatus: advisoryDisplayStatusSchema,
  regions: z.array(z.string()),
  effectiveFrom: z.string(),
  expiresAt: z.string(),
  /** The source locale's headline. */
  headline: z.string(),
  createdByName: z.string().nullable(),
  approvalCount: z.number().int(),
  supersedesId: z.string().uuid().nullable(),
  publishedAt: z.string().nullable(),
  liftedAt: z.string().nullable(),
  updatedAt: z.string(),
});

export type AdvisoryListItemDto = z.infer<typeof advisoryListItemSchema>;

export const advisorySchema = advisoryListItemSchema.extend({
  source: z.string(),
  sourceLocale: z.string(),
  showOnSite: z.boolean(),
  showOnPackages: z.boolean(),
  notifyTravelers: z.boolean(),
  supersedesReference: z.string().nullable(),
  /** The draft or published version that replaces this one, if any. */
  supersededById: z.string().uuid().nullable(),
  translations: z.array(advisoryTranslationSchema),
  approvals: z.array(advisoryApprovalSchema),
  /** What publishing still waits for; empty once published. */
  missingApprovals: z.array(approvalNeedSchema),
  /** The locales publishing still needs (D6). */
  missingTranslations: z.array(z.string()),
  /** Travelers emailed at publication (the audit log's `advisory.delivered`). */
  deliveredCount: z.number().int(),
  acknowledgementCount: z.number().int(),
});

export type AdvisoryDto = z.infer<typeof advisorySchema>;

export const publicAdvisoryQuerySchema = z.object({
  locale: localeSchema.optional(),
  /** A province code; only advisories covering it (or the whole country). */
  province: z
    .string()
    .regex(/^CU\d{2}$/)
    .optional(),
});

export type PublicAdvisoryQuery = z.infer<typeof publicAdvisoryQuerySchema>;

export const advisoryHistoryQuerySchema = z.object({
  locale: localeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type AdvisoryHistoryQuery = z.infer<typeof advisoryHistoryQuerySchema>;

/** What a traveler sees: one language, no desk detail. */
export const publicAdvisorySchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  severity: advisorySeveritySchema,
  displayStatus: advisoryDisplayStatusSchema,
  regions: z.array(z.string()),
  effectiveFrom: z.string(),
  expiresAt: z.string(),
  source: z.string(),
  showOnSite: z.boolean(),
  showOnPackages: z.boolean(),
  /** The language the text is in (the requested one, else the source). */
  locale: z.string(),
  headline: z.string(),
  body: z.string(),
  cta: z.string().nullable(),
  publishedAt: z.string().nullable(),
  liftedAt: z.string().nullable(),
});

export type PublicAdvisoryDto = z.infer<typeof publicAdvisorySchema>;

export const advisoryAcknowledgementsSchema = z.object({
  advisoryIds: z.array(z.string().uuid()),
});

export type AdvisoryAcknowledgementsDto = z.infer<typeof advisoryAcknowledgementsSchema>;

export const advisoryAcknowledgementSchema = z.object({
  advisoryId: z.string().uuid(),
  acknowledgedAt: z.string(),
});

export type AdvisoryAcknowledgementDto = z.infer<typeof advisoryAcknowledgementSchema>;

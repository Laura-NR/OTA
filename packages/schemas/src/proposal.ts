import {
  PROPOSAL_LINE_KINDS,
  PROPOSAL_LINE_UNITS,
  PROPOSAL_STATUSES,
  ServiceType,
  type ProposalLineKind,
  type ProposalLineUnit,
  type ProposalStatus,
} from '@ota/domain';
import { z } from 'zod';

import { nationalitySchema } from './regulatory';

/** M5 custom-trip proposals (`docs/schema-m5-proposal.md`). */

export const customRequestStatusSchema = z.enum(['OPEN', 'CONVERTED', 'CLOSED']);

export const proposalStatusSchema = z.enum([...PROPOSAL_STATUSES] as [
  ProposalStatus,
  ...ProposalStatus[],
]);

export const proposalLineKindSchema = z.enum([...PROPOSAL_LINE_KINDS] as [
  ProposalLineKind,
  ...ProposalLineKind[],
]);

export const proposalLineUnitSchema = z.enum([...PROPOSAL_LINE_UNITS] as [
  ProposalLineUnit,
  ...ProposalLineUnit[],
]);

const serviceTypeSchema = z.enum([
  ServiceType.Guide,
  ServiceType.Transportation,
  ServiceType.Accommodation,
  ServiceType.Experience,
]);

/** The builder's answers, stored on the request and validated before writing. */
export const proposalRequestPayloadSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    adults: z.number().int().min(1).max(20).default(1),
    children: z.number().int().min(0).max(20).default(0),
    /** Catalog items the traveler picked; the desk may add custom lines later. */
    inventoryItemIds: z.array(z.string().uuid()).max(30).default([]),
    nationality: nationalitySchema.optional(),
    /** The design's optional planning inputs; all are free text or a number. */
    budgetPerPerson: z.number().nonnegative().optional(),
    interests: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    pace: z.string().trim().max(40).optional(),
  })
  .refine((payload) => payload.endDate >= payload.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });

export type ProposalRequestPayload = z.infer<typeof proposalRequestPayloadSchema>;

/** The stored payload as the API returns it: dates are ISO strings, optionals null. */
export const proposalRequestPayloadDtoSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  adults: z.number().int(),
  children: z.number().int(),
  inventoryItemIds: z.array(z.string().uuid()),
  nationality: z.string().nullable(),
  budgetPerPerson: z.number().nullable(),
  interests: z.array(z.string()),
  pace: z.string().nullable(),
});

export type ProposalRequestPayloadDto = z.infer<typeof proposalRequestPayloadDtoSchema>;

export const createCustomRequestSchema = proposalRequestPayloadSchema.extend({
  notes: z.string().trim().max(2000).optional(),
  locale: z.string().trim().min(2).max(5).optional(),
});

export type CreateCustomRequestRequest = z.infer<typeof createCustomRequestSchema>;

export const proposalStopSchema = z.object({
  province: z.string().trim().min(1).max(80),
  nights: z.number().int().min(0).max(60),
  accommodation: z.string().trim().max(200).optional(),
});

export type ProposalStopDto = z.infer<typeof proposalStopSchema>;

export const proposalDaySchema = z.object({
  day: z.number().int().min(1).max(120),
  date: z.string().trim().optional(),
  location: z.string().trim().min(1).max(120),
  plan: z.string().trim().min(1).max(2000),
  with: z.string().trim().max(120).optional(),
});

export type ProposalDayDto = z.infer<typeof proposalDaySchema>;

export const proposalOptionSchema = z.object({
  label: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  price: z.number().nonnegative().optional(),
});

/** The snapshot the D-Proposal prints; stored as JSON on the version. */
export const proposalDocumentSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  startDate: z.string(),
  endDate: z.string(),
  adults: z.number().int().min(1),
  children: z.number().int().min(0),
  stops: z.array(proposalStopSchema).max(30).default([]),
  days: z.array(proposalDaySchema).max(120).default([]),
  options: z.array(proposalOptionSchema).max(30).default([]),
  notes: z.string().trim().max(2000).optional(),
});

export type ProposalDocument = z.infer<typeof proposalDocumentSchema>;

export type ProposalOptionDto = z.infer<typeof proposalOptionSchema>;

export const proposalLineInputSchema = z.object({
  kind: proposalLineKindSchema,
  unit: proposalLineUnitSchema.default('PER_BOOKING'),
  label: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  quantity: z.number().positive().max(1000).default(1),
  unitAmount: z.number().nonnegative(),
  serviceType: serviceTypeSchema.optional(),
  province: z.string().trim().max(80).optional(),
  serviceDateStart: z.coerce.date().optional(),
  serviceDateEnd: z.coerce.date().optional(),
  inventoryItemId: z.string().uuid().optional(),
});

export type ProposalLineInput = z.infer<typeof proposalLineInputSchema>;

export const createProposalVersionSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  validUntil: z.coerce.date().optional(),
  currency: z.string().trim().length(3).default('EUR'),
  lines: z.array(proposalLineInputSchema).min(1).max(50),
  stops: z.array(proposalStopSchema).max(30).default([]),
  days: z.array(proposalDaySchema).max(120).default([]),
  options: z.array(proposalOptionSchema).max(30).default([]),
  notes: z.string().trim().max(2000).optional(),
});

export type CreateProposalVersionRequest = z.infer<typeof createProposalVersionSchema>;

export const acceptProposalSchema = z.object({
  versionId: z.string().uuid(),
});

export type AcceptProposalRequest = z.infer<typeof acceptProposalSchema>;

export const declineProposalSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export type DeclineProposalRequest = z.infer<typeof declineProposalSchema>;

export const proposalPriceLineSchema = z.object({
  id: z.string().uuid(),
  kind: proposalLineKindSchema,
  unit: proposalLineUnitSchema,
  label: z.string(),
  description: z.string().nullable(),
  quantity: z.string(),
  unitAmount: z.string(),
  amount: z.string(),
  currency: z.string(),
  position: z.number().int(),
  serviceType: serviceTypeSchema.nullable(),
  province: z.string().nullable(),
  serviceDateStart: z.string().nullable(),
  serviceDateEnd: z.string().nullable(),
  inventoryItemId: z.string().uuid().nullable(),
});

export type ProposalPriceLineDto = z.infer<typeof proposalPriceLineSchema>;

export const proposalVersionSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int(),
  currency: z.string(),
  total: z.string(),
  perPerson: z.string().nullable(),
  validUntil: z.string(),
  document: proposalDocumentSchema,
  terms: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  lines: z.array(proposalPriceLineSchema),
});

export type ProposalVersionDto = z.infer<typeof proposalVersionSchema>;

export const proposalRequestSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  status: customRequestStatusSchema,
  payload: proposalRequestPayloadDtoSchema,
  notes: z.string().nullable(),
  locale: z.string().nullable(),
  createdAt: z.string(),
});

export type ProposalRequestDto = z.infer<typeof proposalRequestSchema>;

export const proposalSchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  reference: z.string(),
  status: proposalStatusSchema,
  currentVersion: z.number().int(),
  acceptedVersionId: z.string().uuid().nullable(),
  reservationId: z.string().uuid().nullable(),
  reservationCode: z.string().nullable(),
  sentAt: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  declinedAt: z.string().nullable(),
  declineReason: z.string().nullable(),
  createdAt: z.string(),
  customerEmail: z.string().nullable(),
  customerName: z.string().nullable(),
  request: proposalRequestSchema,
  versions: z.array(proposalVersionSchema),
});

export type ProposalDto = z.infer<typeof proposalSchema>;

export const proposalListItemSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  status: proposalStatusSchema,
  requestId: z.string().uuid(),
  customerEmail: z.string().nullable(),
  customerName: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  adults: z.number().int(),
  children: z.number().int(),
  currentVersion: z.number().int(),
  total: z.string().nullable(),
  currency: z.string().nullable(),
  validUntil: z.string().nullable(),
  createdAt: z.string(),
});

export type ProposalListItemDto = z.infer<typeof proposalListItemSchema>;

export const proposalQueueQuerySchema = z.object({
  status: proposalStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type ProposalQueueQuery = z.infer<typeof proposalQueueQuerySchema>;

export const createCustomRequestResultSchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  reference: z.string(),
});

export type CreateCustomRequestResultDto = z.infer<
  typeof createCustomRequestResultSchema
>;

export const acceptProposalResultSchema = z.object({
  reservationId: z.string().uuid(),
  bookingCode: z.string(),
});

export type AcceptProposalResultDto = z.infer<typeof acceptProposalResultSchema>;

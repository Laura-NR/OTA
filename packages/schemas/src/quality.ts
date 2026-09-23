import { z } from 'zod';

/**
 * Duty-of-care incident log (spec §4.9.4). The `Incident` model already exists,
 * so this adds the operations surface, not a schema change.
 */
export const incidentSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export type IncidentSeverity = z.infer<typeof incidentSeveritySchema>;

export const createIncidentSchema = z.object({
  category: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(2000),
  severity: incidentSeveritySchema.default('MEDIUM'),
});

export type CreateIncidentRequest = z.infer<typeof createIncidentSchema>;

export const listIncidentsQuerySchema = z.object({
  reservationId: z.string().uuid().optional(),
  resolved: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListIncidentsQuery = z.infer<typeof listIncidentsQuerySchema>;

export const incidentSchema = z.object({
  id: z.string().uuid(),
  reservationId: z.string().uuid(),
  bookingCode: z.string(),
  category: z.string(),
  description: z.string(),
  severity: z.string(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type IncidentDto = z.infer<typeof incidentSchema>;

export const resolveIncidentSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export type ResolveIncidentRequest = z.infer<typeof resolveIncidentSchema>;

/** Worker reliability scorecard derived from the dispatch-offer ledger. */
export const supplierReliabilitySchema = z.object({
  supplierId: z.string().uuid(),
  supplierName: z.string().nullable(),
  offers: z.number().int(),
  accepted: z.number().int(),
  declined: z.number().int(),
  timedOut: z.number().int(),
  acceptanceRate: z.number(),
  timeoutRate: z.number(),
  averageResponseMinutes: z.number(),
});

export type SupplierReliabilityDto = z.infer<typeof supplierReliabilitySchema>;

import { z } from 'zod';

/**
 * Duty-of-care incident log (spec §4.9.4): the desk's own entries and, since
 * W-Job (`docs/schema-w-job.md` J5), a worker's on-site emergency reports.
 */
export const incidentSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const incidentSourceSchema = z.enum(['DESK', 'WORKER_APP', 'WORKER_SMS']);

export type IncidentSourceName = z.infer<typeof incidentSourceSchema>;

export type IncidentSeverity = z.infer<typeof incidentSeveritySchema>;

export const createIncidentSchema = z.object({
  category: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(2000),
  severity: incidentSeveritySchema.default('MEDIUM'),
  /** W-Job J6: `WORKER_SMS` when the desk enters a report that arrived only by SMS. */
  source: z.enum(['DESK', 'WORKER_SMS']).default('DESK'),
  /** The service the report is about, from the booking's own services. */
  serviceItemId: z.string().uuid().optional(),
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
  /** W-Job J5: who put it in the log, and a worker's report details. */
  source: incidentSourceSchema,
  serviceItemId: z.string().uuid().nullable(),
  supplierName: z.string().nullable(),
  /** The reporter's phone, to call back (operations roles only read incidents). */
  supplierPhone: z.string().nullable(),
  position: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      accuracyM: z.number().int().nullable(),
    })
    .nullable(),
  occurredAt: z.string().nullable(),
  acknowledgedAt: z.string().nullable(),
  acknowledgedBy: z.string().nullable(),
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
  /** Offers accepted, declined or timed out: the base of the rates. */
  answered: z.number().int(),
  accepted: z.number().int(),
  declined: z.number().int(),
  timedOut: z.number().int(),
  acceptanceRate: z.number(),
  timeoutRate: z.number(),
  averageResponseMinutes: z.number(),
});

export type SupplierReliabilityDto = z.infer<typeof supplierReliabilitySchema>;

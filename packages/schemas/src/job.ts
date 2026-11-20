import { EMERGENCY_CATEGORIES, JOB_STEPS } from '@ota/domain';
import { z } from 'zod';

/**
 * W-Job (`docs/schema-w-job.md`, approved J1–J9): the desk's brief for a
 * service, the worker's steps on it and their on-site emergency report.
 */

export const jobStepSchema = z.enum(JOB_STEPS);

export type JobStepName = z.infer<typeof jobStepSchema>;

/** When each step was recorded (J2); null until it is. */
export const jobStepTimesSchema = z.object({
  EN_ROUTE: z.string().nullable(),
  ARRIVED: z.string().nullable(),
  STARTED: z.string().nullable(),
  FINISHED: z.string().nullable(),
});

export type JobStepTimesDto = z.infer<typeof jobStepTimesSchema>;

/** The latest step and when it happened, which the desk and the traveler see (J4). */
export const currentJobStepSchema = z.object({
  step: jobStepSchema,
  at: z.string(),
});

export type CurrentJobStepDto = z.infer<typeof currentJobStepSchema>;

const briefText = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

/** The desk's brief for one service (J1); an empty field clears it, an absent one keeps it. */
export const serviceItemBriefSchema = z.object({
  meetingPoint: briefText,
  dropOff: briefText,
  workerBrief: briefText,
});

export type ServiceItemBriefRequest = z.infer<typeof serviceItemBriefSchema>;

/** The brief as the desk and the worker read it. */
export const jobBriefSchema = z.object({
  meetingPoint: z.string().nullable(),
  dropOff: z.string().nullable(),
  workerBrief: z.string().nullable(),
});

export type JobBriefDto = z.infer<typeof jobBriefSchema>;

/** A step tapped in the app, or recorded by the desk after a call (J2). */
export const recordJobStepSchema = z.object({
  step: jobStepSchema,
  /** When it happened, ISO 8601: the phone's tap corrected by the API's clock. */
  occurredAt: z.string().datetime({ offset: true }),
});

export type RecordJobStepRequest = z.infer<typeof recordJobStepSchema>;

export const emergencyCategorySchema = z.enum(EMERGENCY_CATEGORIES);

export type EmergencyCategoryName = z.infer<typeof emergencyCategorySchema>;

/** The worker's on-site emergency report (J5, J7). */
export const reportEmergencySchema = z.object({
  category: emergencyCategorySchema,
  occurredAt: z.string().datetime({ offset: true }),
  /** The app's id for the report, so a resent one is not doubled. */
  clientRef: z.string().uuid(),
  position: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracyM: z.number().min(0).max(100_000).nullable(),
    })
    .nullable(),
});

export type ReportEmergencyRequest = z.infer<typeof reportEmergencySchema>;

export const emergencyReportResultSchema = z.object({
  incidentId: z.string().uuid(),
  createdAt: z.string(),
});

export type EmergencyReportResultDto = z.infer<typeof emergencyReportResultSchema>;

/** The night's host on a job (J8): a first name and a Cuban phone only. */
export const jobContactSchema = z.object({
  firstName: z.string().nullable(),
  phone: z.string(),
});

export type JobContactDto = z.infer<typeof jobContactSchema>;

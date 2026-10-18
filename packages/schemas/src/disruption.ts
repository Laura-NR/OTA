import {
  DISRUPTION_CHOICE_SOURCES,
  DISRUPTION_OPTION_KEYS,
  DISRUPTION_SEVERITIES,
  DISRUPTION_STATUSES,
  TRAVELER_SAFETY_STATES,
  type DisruptionChoiceSource,
  type DisruptionOptionKey,
  type DisruptionSeverity,
  type DisruptionStatus,
  type TravelerSafety,
} from '@ota/domain';
import { z } from 'zod';

import { advisoryDisplayStatusSchema, advisorySeveritySchema } from './advisory';

/** M8 disruption cases (`docs/schema-m8-disruptions.md`). */

export const disruptionSeveritySchema = z.enum([...DISRUPTION_SEVERITIES] as [
  DisruptionSeverity,
  ...DisruptionSeverity[],
]);

export const disruptionStatusSchema = z.enum([...DISRUPTION_STATUSES] as [
  DisruptionStatus,
  ...DisruptionStatus[],
]);

export const travelerSafetySchema = z.enum([...TRAVELER_SAFETY_STATES] as [
  TravelerSafety,
  ...TravelerSafety[],
]);

export const disruptionChoiceSourceSchema = z.enum([...DISRUPTION_CHOICE_SOURCES] as [
  DisruptionChoiceSource,
  ...DisruptionChoiceSource[],
]);

export const disruptionOptionKeySchema = z.enum([...DISRUPTION_OPTION_KEYS] as [
  DisruptionOptionKey,
  ...DisruptionOptionKey[],
]);

export const disruptionOfferStateSchema = z.enum([
  'NOT_SENT',
  'AWAITING',
  'CHOSEN',
  'DEFAULTED',
]);

const provinceSchema = z.string().regex(/^CU\d{2}$/);
const bookingCodeSchema = z.string().trim().min(4).max(20);

/**
 * Opening a case from a manifest scenario: the case copies the scenario's
 * steps, options and compensation rule (D1) and may attach bookings at once.
 */
export const disruptionCreateSchema = z.object({
  scenario: z.string().trim().min(1).max(40),
  severity: disruptionSeveritySchema,
  province: provinceSchema.nullable(),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(2000),
  reservationIds: z.array(z.string().uuid()).max(50).default([]),
});

export type DisruptionCreateRequest = z.infer<typeof disruptionCreateSchema>;

/** Severity is the desk's call at any time (D3); closing ends the case. */
export const disruptionUpdateSchema = z
  .object({
    severity: disruptionSeveritySchema.optional(),
    ownerId: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(1).max(160).optional(),
    summary: z.string().trim().min(1).max(2000).optional(),
    close: z.literal(true).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'nothing to update',
  });

export type DisruptionUpdateRequest = z.infer<typeof disruptionUpdateSchema>;

export const disruptionAttachSchema = z
  .object({
    reservationIds: z.array(z.string().uuid()).max(50).default([]),
    bookingCodes: z.array(bookingCodeSchema).max(50).default([]),
  })
  .refine((value) => value.reservationIds.length + value.bookingCodes.length > 0, {
    message: 'name at least one booking',
  });

export type DisruptionAttachRequest = z.infer<typeof disruptionAttachSchema>;

export const disruptionOptionInputSchema = z.object({
  key: disruptionOptionKeySchema,
  title: z.string().trim().min(1).max(160),
  /** States the money consequence (D4). */
  detail: z.string().trim().min(1).max(500),
});

/** The case's one option set, keyed A, B, C, D in order; fixed once sent. */
export const disruptionOptionsWriteSchema = z
  .object({ options: z.array(disruptionOptionInputSchema).min(1).max(4) })
  .refine(
    (value) =>
      value.options.every(
        (option, index) => option.key === DISRUPTION_OPTION_KEYS[index],
      ),
    { message: 'options must be keyed A, B, C, D in order', path: ['options'] },
  );

export type DisruptionOptionsWriteRequest = z.infer<typeof disruptionOptionsWriteSchema>;

/** One offer per listed booking: a deadline and the option that stands without an answer. */
export const disruptionSendOptionsSchema = z.object({
  deadline: z.coerce.date(),
  defaultOptionKey: disruptionOptionKeySchema,
  reservationIds: z.array(z.string().uuid()).min(1).max(50),
});

export type DisruptionSendOptionsRequest = z.infer<typeof disruptionSendOptionsSchema>;

/** "Marking safe records who confirmed and how" (D6): the note says how. */
export const disruptionSafetySchema = z.object({
  safety: travelerSafetySchema,
  note: z.string().trim().min(1).max(500).nullable().optional(),
  /** When the party was reached; defaults to now. */
  contactAt: z.coerce.date().optional(),
});

export type DisruptionSafetyRequest = z.infer<typeof disruptionSafetySchema>;

/** The desk records a phone answer, or confirms the default after the deadline. */
export const disruptionDeskChoiceSchema = z.object({
  key: disruptionOptionKeySchema,
  source: z.enum(['DESK', 'DEFAULT']).default('DESK'),
});

export type DisruptionDeskChoiceRequest = z.infer<typeof disruptionDeskChoiceSchema>;

export const disruptionTravelerChoiceSchema = z.object({
  key: disruptionOptionKeySchema,
});

export type DisruptionTravelerChoiceRequest = z.infer<
  typeof disruptionTravelerChoiceSchema
>;

export const disruptionListQuerySchema = z.object({
  status: disruptionStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type DisruptionListQuery = z.infer<typeof disruptionListQuerySchema>;

export const disruptionCountsSchema = z.object({
  affected: z.number().int(),
  onTheGround: z.number().int(),
  arriving: z.number().int(),
  safe: z.number().int(),
  needsHelp: z.number().int(),
  unknown: z.number().int(),
  overdueUnknown: z.number().int(),
  callNow: z.number().int(),
});

export type DisruptionCountsDto = z.infer<typeof disruptionCountsSchema>;

export const effectiveChoiceSchema = z.object({
  key: z.string(),
  source: disruptionChoiceSourceSchema,
  derived: z.boolean(),
});

export const disruptionStepSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int(),
  text: z.string(),
  owner: z.string(),
  due: z.string(),
  doneAt: z.string().nullable(),
  doneByName: z.string().nullable(),
});

export type DisruptionStepDto = z.infer<typeof disruptionStepSchema>;

export const disruptionOptionSchema = z.object({
  key: z.string(),
  position: z.number().int(),
  title: z.string(),
  detail: z.string(),
});

export type DisruptionOptionDto = z.infer<typeof disruptionOptionSchema>;

/** One row of the status board, which also carries the booking's offer. */
export const disruptionCaseBookingSchema = z.object({
  id: z.string().uuid(),
  reservationId: z.string().uuid(),
  bookingCode: z.string(),
  status: z.string(),
  /** The lead traveler's name, else the account's (null once anonymized). */
  travelerName: z.string().nullable(),
  travelerEmail: z.string().nullable(),
  travelerPhone: z.string().nullable(),
  nationality: z.string().nullable(),
  partySize: z.number().int(),
  startDate: z.string(),
  endDate: z.string(),
  underWay: z.boolean(),
  arriving: z.boolean(),
  attachedAt: z.string(),
  safety: travelerSafetySchema,
  lastContactAt: z.string().nullable(),
  safetyNote: z.string().nullable(),
  safetyConfirmedByName: z.string().nullable(),
  /** "Unknown" past the severity's contact timer (D6). */
  overdueUnknown: z.boolean(),
  offerSentAt: z.string().nullable(),
  offerDeadline: z.string().nullable(),
  defaultOptionKey: z.string().nullable(),
  chosenOptionKey: z.string().nullable(),
  choiceSource: disruptionChoiceSourceSchema.nullable(),
  chosenAt: z.string().nullable(),
  chosenByName: z.string().nullable(),
  offerState: disruptionOfferStateSchema,
  effectiveChoice: effectiveChoiceSchema.nullable(),
  /** On the desk's "call now" list: the deadline passed with no answer. */
  needsCall: z.boolean(),
});

export type DisruptionCaseBookingDto = z.infer<typeof disruptionCaseBookingSchema>;

export const disruptionSuggestionSchema = z.object({
  reservationId: z.string().uuid(),
  bookingCode: z.string(),
  status: z.string(),
  travelerName: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  underWay: z.boolean(),
});

export type DisruptionSuggestionDto = z.infer<typeof disruptionSuggestionSchema>;

export const disruptionAdvisoryLinkSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  severity: advisorySeveritySchema,
  displayStatus: advisoryDisplayStatusSchema,
  headline: z.string(),
});

export type DisruptionAdvisoryLinkDto = z.infer<typeof disruptionAdvisoryLinkSchema>;

/** One case-log line, read back from the audit log (D8). */
export const disruptionLogEntrySchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  actorName: z.string().nullable(),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});

export type DisruptionLogEntryDto = z.infer<typeof disruptionLogEntrySchema>;

export const disruptionListItemSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  scenario: z.string(),
  /** The manifest's label; null if the scenario was removed since. */
  scenarioLabel: z.string().nullable(),
  severity: disruptionSeveritySchema,
  status: disruptionStatusSchema,
  province: z.string().nullable(),
  title: z.string(),
  ownerId: z.string().uuid().nullable(),
  ownerName: z.string().nullable(),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  counts: disruptionCountsSchema,
});

export type DisruptionListItemDto = z.infer<typeof disruptionListItemSchema>;

export const disruptionCaseSchema = disruptionListItemSchema.extend({
  summary: z.string(),
  policy: z.string(),
  /** The scenario's trigger as the manifest words it now; null if removed. */
  trigger: z.string().nullable(),
  steps: z.array(disruptionStepSchema),
  options: z.array(disruptionOptionSchema),
  /** True once any booking was sent the options: the set is then fixed (D4). */
  optionsLocked: z.boolean(),
  bookings: z.array(disruptionCaseBookingSchema),
  suggestions: z.array(disruptionSuggestionSchema),
  advisories: z.array(disruptionAdvisoryLinkSchema),
  log: z.array(disruptionLogEntrySchema),
});

export type DisruptionCaseDto = z.infer<typeof disruptionCaseSchema>;

/** What the traveler sees on the trip page: the offer, its options and the rule. */
export const meDisruptionSchema = z.object({
  /** The attached booking's row: the offer the choice answers. */
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  reference: z.string(),
  reservationId: z.string().uuid(),
  bookingCode: z.string(),
  title: z.string(),
  summary: z.string(),
  severity: disruptionSeveritySchema,
  policy: z.string(),
  options: z.array(disruptionOptionSchema),
  offerSentAt: z.string().nullable(),
  offerDeadline: z.string().nullable(),
  defaultOptionKey: z.string().nullable(),
  chosenOptionKey: z.string().nullable(),
  choiceSource: disruptionChoiceSourceSchema.nullable(),
  chosenAt: z.string().nullable(),
  offerState: disruptionOfferStateSchema,
  effectiveChoice: effectiveChoiceSchema.nullable(),
});

export type MeDisruptionDto = z.infer<typeof meDisruptionSchema>;

export const meDisruptionQuerySchema = z.object({
  reservationId: z.string().uuid().optional(),
});

export type MeDisruptionQuery = z.infer<typeof meDisruptionQuerySchema>;

/** The dashboard alert: open cases with red Unknowns or calls due. */
export const disruptionAlertSchema = z.object({
  openCases: z.number().int(),
  overdueUnknown: z.number().int(),
  callNow: z.number().int(),
  needsHelp: z.number().int(),
});

export type DisruptionAlertDto = z.infer<typeof disruptionAlertSchema>;

import { ServiceItemStatus, ServiceType } from '@ota/domain';
import { z } from 'zod';

import { reservationStatusSchema } from './reservation';
import { supplierCategorySchema } from './supplier';

export const serviceTypeSchema = z.enum([
  ServiceType.Guide,
  ServiceType.Transportation,
  ServiceType.Accommodation,
  ServiceType.Experience,
]);

export const serviceItemStatusSchema = z.enum([
  ServiceItemStatus.Unassigned,
  ServiceItemStatus.Offered,
  ServiceItemStatus.Accepted,
  ServiceItemStatus.Declined,
  ServiceItemStatus.Timeout,
  ServiceItemStatus.Fulfilled,
]);

export const escalationAlertSchema = z.enum(['NONE', 'AMBER', 'RED']);

export const declineServiceItemSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type DeclineServiceItemRequest = z.infer<typeof declineServiceItemSchema>;

export const reassignServiceItemSchema = z.object({
  supplierId: z.string().uuid().optional(),
});

export type ReassignServiceItemRequest = z.infer<typeof reassignServiceItemSchema>;

export const dispatchServiceItemSchema = z.object({
  id: z.string().uuid(),
  serviceType: serviceTypeSchema,
  status: serviceItemStatusSchema,
  supplierId: z.string().uuid().nullable(),
  province: z.string().nullable(),
  offeredAt: z.string().nullable(),
  deadline: z.string().nullable(),
  escalation: escalationAlertSchema,
  // Present when the item is offered, for the operations desk's click-to-call.
  workerPhone: z.string().nullable(),
});

export type DispatchServiceItemDto = z.infer<typeof dispatchServiceItemSchema>;

export const dispatchCandidateSchema = z.object({
  supplierId: z.string().uuid(),
  fullName: z.string().nullable(),
  category: supplierCategorySchema,
  primaryPhone: z.string(),
  provincesActive: z.array(z.string()),
  credentialExpiresAt: z.string().nullable(),
  /** Acceptance over answered offers; null before the first answer. */
  acceptanceRate: z.number().nullable(),
  /**
   * Below the reliability floor: automatic dispatch skips the supplier, the
   * desk may still choose them.
   */
  belowReliabilityFloor: z.boolean(),
});

export type DispatchCandidateDto = z.infer<typeof dispatchCandidateSchema>;

export const dispatchViewSchema = z.object({
  reservationId: z.string().uuid(),
  bookingCode: z.string(),
  status: reservationStatusSchema,
  serviceItems: z.array(dispatchServiceItemSchema),
});

export type DispatchViewDto = z.infer<typeof dispatchViewSchema>;

/**
 * A row of the operations desk's dispatch matrix (A-Dashboard,
 * `GET /dispatch/active`): the dispatch view plus who and when. Ops-only; a
 * worker's own view stays `DispatchViewDto`, which names nobody.
 */
/**
 * Who on the desk acknowledged an item's red alert (A-A11y 01), for the offer
 * that raised it. One acknowledgement stops the cue for the whole desk.
 */
export const alertAcknowledgementSchema = z.object({
  at: z.string(),
  /** The operator's name, else their email; null once the account is gone. */
  by: z.string().nullable(),
});

export type AlertAcknowledgementDto = z.infer<typeof alertAcknowledgementSchema>;

export const dispatchBoardItemSchema = dispatchServiceItemSchema.extend({
  supplierName: z.string().nullable(),
  /** When the worker answered: a decline's time dates its red alert. */
  respondedAt: z.string().nullable(),
  /** The current red alert's acknowledgement; null when it has none. */
  acknowledgement: alertAcknowledgementSchema.nullable(),
});

export type DispatchBoardItemDto = z.infer<typeof dispatchBoardItemSchema>;

export const dispatchBoardRowSchema = dispatchViewSchema.extend({
  travelerName: z.string().nullable(),
  travelerEmail: z.string().email(),
  startDate: z.string(),
  endDate: z.string(),
  /**
   * When the booking started waiting on workers: its first offer, which a
   * re-dispatch keeps; the booking's creation when nothing was offered yet.
   */
  waitingSince: z.string(),
  serviceItems: z.array(dispatchBoardItemSchema),
});

export type DispatchBoardRowDto = z.infer<typeof dispatchBoardRowSchema>;

/**
 * `POST /service-items/:id/acknowledge-alert`: the offer whose red alert the
 * desk acknowledged, so an item offered again since is not acknowledged by
 * mistake.
 */
export const acknowledgeAlertSchema = z.object({
  offeredAt: z.string().datetime().nullable(),
});

export type AcknowledgeAlertRequest = z.infer<typeof acknowledgeAlertSchema>;

/** The desk's "Mute 15 min" in force: who muted the cue, and until when. */
export const deskAlertMuteSchema = z.object({
  startedAt: z.string(),
  until: z.string(),
  by: z.string().nullable(),
});

export type DeskAlertMuteDto = z.infer<typeof deskAlertMuteSchema>;

/** `GET|POST|DELETE /dispatch/alert-mute`. */
export const deskAlertMuteStateSchema = z.object({
  mute: deskAlertMuteSchema.nullable(),
});

export type DeskAlertMuteStateDto = z.infer<typeof deskAlertMuteStateSchema>;

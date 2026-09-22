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
});

export type DispatchCandidateDto = z.infer<typeof dispatchCandidateSchema>;

export const dispatchViewSchema = z.object({
  reservationId: z.string().uuid(),
  bookingCode: z.string(),
  status: reservationStatusSchema,
  serviceItems: z.array(dispatchServiceItemSchema),
});

export type DispatchViewDto = z.infer<typeof dispatchViewSchema>;

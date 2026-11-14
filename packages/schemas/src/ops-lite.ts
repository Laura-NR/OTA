import { z } from 'zod';

import { disruptionSeveritySchema } from './disruption';
import { messageSenderSchema } from './message';
import { reservationStatusSchema } from './reservation';

const toneSchema = z.enum(['default', 'warning', 'error', 'success', 'info', 'muted']);

/** A row's clock on AL-Pipeline (`pipelineClock`); the screen words it. */
export const opsLiteClockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('waiting'), ms: z.number().int(), tone: toneSchema }),
  z.object({ kind: z.literal('left'), ms: z.number().int(), tone: toneSchema }),
  z.object({ kind: z.literal('expired'), tone: toneSchema }),
  z.object({ kind: z.literal('starts'), days: z.number().int(), tone: toneSchema }),
  z.object({ kind: z.literal('day'), day: z.number().int(), tone: toneSchema }),
  z.object({ kind: z.literal('date'), date: z.string(), tone: toneSchema }),
]);

export type OpsLiteClockDto = z.infer<typeof opsLiteClockSchema>;

/** Who a booking is, for a phone row: the traveler, the party and a number to call. */
const bookingContextSchema = z.object({
  reservationId: z.string().uuid(),
  bookingCode: z.string(),
  status: reservationStatusSchema,
  travelerName: z.string().nullable(),
  travelerEmail: z.string().email(),
  /** The traveler's phone, for click-to-call; null when none is on file. */
  travelerPhone: z.string().nullable(),
  partySize: z.number().int().positive(),
  startDate: z.string(),
  endDate: z.string(),
  /** The province names its services take place in. */
  provinces: z.array(z.string()),
});

export const opsLitePipelineRowSchema = bookingContextSchema.extend({
  serviceItemCount: z.number().int().nonnegative(),
  serviceItemsAccepted: z.number().int().nonnegative(),
  clock: opsLiteClockSchema,
});

export type OpsLitePipelineRowDto = z.infer<typeof opsLitePipelineRowSchema>;

export const opsLitePipelineStateSchema = z.object({
  status: reservationStatusSchema,
  count: z.number().int().nonnegative(),
  /** The state's most pressing bookings, at most `OPS_LITE_STATE_ROWS`. */
  rows: z.array(opsLitePipelineRowSchema),
});

export type OpsLitePipelineStateDto = z.infer<typeof opsLitePipelineStateSchema>;

export const opsLiteMovementSchema = z.object({
  kind: z.enum(['PAYMENT_DUE', 'ARRIVAL', 'DEPARTURE']),
  /** The payment's due time; arrivals and departures carry their date only. */
  at: z.string().nullable(),
  reservationId: z.string().uuid(),
  bookingCode: z.string(),
  travelerName: z.string().nullable(),
  travelerEmail: z.string().email(),
  partySize: z.number().int().positive(),
});

export type OpsLiteMovementDto = z.infer<typeof opsLiteMovementSchema>;

/** `GET /ops-lite/pipeline` (AL-Pipeline). */
export const opsLitePipelineSchema = z.object({
  /** Every booking past its draft. */
  total: z.number().int().nonnegative(),
  /** Submitted and not yet confirmed (`OPS_LITE_OPEN_STATES`). */
  inPipeline: z.number().int().nonnegative(),
  refreshedAt: z.string(),
  states: z.array(opsLitePipelineStateSchema),
  ground: z.object({
    bookings: z.number().int().nonnegative(),
    travelers: z.number().int().nonnegative(),
    provinces: z.array(
      z.object({
        /** The province's name. */
        province: z.string(),
        travelers: z.number().int().positive(),
        /** An open case's scenario key there (outage, hurricane…), if any. */
        scenario: z.string().nullable(),
      }),
    ),
    /** Open disruption cases, the most severe first. */
    cases: z.array(
      z.object({
        id: z.string().uuid(),
        reference: z.string(),
        severity: disruptionSeveritySchema,
        title: z.string(),
      }),
    ),
  }),
  movements: z.array(opsLiteMovementSchema),
});

export type OpsLitePipelineDto = z.infer<typeof opsLitePipelineSchema>;

export const opsLiteInboxThreadSchema = bookingContextSchema.extend({
  lastMessage: z.object({
    body: z.string(),
    sender: messageSenderSchema,
    createdAt: z.string(),
  }),
  /** The traveler's messages nobody on the desk has opened yet. */
  unread: z.number().int().nonnegative(),
  /** The traveler wrote last. */
  awaitingReply: z.boolean(),
  /** Awaiting a reply while the booking is on an open disruption case. */
  urgent: z.boolean(),
  /** The open case the booking is on, if any. */
  disruption: z.object({ id: z.string().uuid(), reference: z.string() }).nullable(),
});

export type OpsLiteInboxThreadDto = z.infer<typeof opsLiteInboxThreadSchema>;

/** `GET /ops-lite/inbox` (AL-Inbox): urgent first, then unread, then the latest. */
export const opsLiteInboxSchema = z.object({
  threads: z.array(opsLiteInboxThreadSchema),
  counts: z.object({
    all: z.number().int().nonnegative(),
    urgent: z.number().int().nonnegative(),
    unread: z.number().int().nonnegative(),
  }),
});

export type OpsLiteInboxDto = z.infer<typeof opsLiteInboxSchema>;

import {
  EVENT_ACCESS,
  EVENT_REQUEST_PATHS,
  EVENT_REQUEST_STATUSES,
  EVENT_STATUSES,
  MAX_EVENT_SEATS,
  MAX_EVENT_TRIP_NIGHTS,
  SEAT_CATEGORY_KINDS,
  type EventAccess,
  type EventRequestPath,
  type EventRequestStatus,
  type EventStatus,
  type SeatCategoryKind,
} from '@ota/domain';
import { z } from 'zod';

import { nationalitySchema } from './regulatory';

/** M10 events and the ticket concierge (`docs/schema-m10-events.md`). */

export const eventStatusSchema = z.enum([...EVENT_STATUSES] as [
  EventStatus,
  ...EventStatus[],
]);

export const eventAccessSchema = z.enum([...EVENT_ACCESS] as [
  EventAccess,
  ...EventAccess[],
]);

export const seatCategoryKindSchema = z.enum([...SEAT_CATEGORY_KINDS] as [
  SeatCategoryKind,
  ...SeatCategoryKind[],
]);

export const eventRequestStatusSchema = z.enum([...EVENT_REQUEST_STATUSES] as [
  EventRequestStatus,
  ...EventRequestStatus[],
]);

export const eventRequestPathSchema = z.enum([...EVENT_REQUEST_PATHS] as [
  EventRequestPath,
  ...EventRequestPath[],
]);

const provinceCode = z.string().regex(/^CU\d{2}$/);
const localeSchema = z.string().trim().min(2).max(10);
const dateSchema = z.coerce.date();
const money = z.number().min(0).max(100_000);

/** A night of the programme; `id` keeps an existing night (requests point at it). */
export const eventNightInputSchema = z.object({
  id: z.string().uuid().optional(),
  date: dateSchema,
  label: z.string().trim().min(1).max(120),
  venue: z.string().trim().min(1).max(160).nullable().default(null),
});

/** A seat category; `id` keeps an existing one (requests point at it). */
export const eventCategoryInputSchema = z.object({
  id: z.string().uuid().optional(),
  kind: seatCategoryKindSchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(240).nullable().default(null),
  /** Indicative; null until the organiser announces it. */
  pricePerSeat: money.nullable().default(null),
});

/**
 * An event's editable document (D1, D2). Saving sends the whole document:
 * nights and categories with an id are updated, new ones added, missing ones
 * removed unless a request holds them.
 */
export const eventWriteSchema = z
  .object({
    access: eventAccessSchema,
    province: provinceCode,
    startsOn: dateSchema,
    endsOn: dateSchema,
    datesConfirmed: z.boolean(),
    confirmBy: dateSchema.nullable().default(null),
    sourceLocale: localeSchema,
    name: z.string().trim().min(1).max(120),
    place: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(1200),
    notes: z.string().trim().min(1).max(2000).nullable().default(null),
    nights: z.array(eventNightInputSchema).max(31).default([]),
    categories: z.array(eventCategoryInputSchema).max(8).default([]),
  })
  .refine((value) => value.endsOn >= value.startsOn, {
    message: 'endsOn must be on or after startsOn',
    path: ['endsOn'],
  });

export type EventWriteRequest = z.infer<typeof eventWriteSchema>;

const overlayText = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

/** One locale's overlay (D1); nights and categories are keyed by their id. */
export const eventTranslationWriteSchema = z.object({
  name: overlayText(120),
  place: overlayText(160),
  summary: overlayText(1200),
  notes: overlayText(2000),
  nights: z
    .record(
      z.string().uuid(),
      z.object({ label: overlayText(120), venue: overlayText(160) }),
    )
    .default({}),
  categories: z
    .record(
      z.string().uuid(),
      z.object({ name: overlayText(80), description: overlayText(240) }),
    )
    .default({}),
  published: z.boolean(),
});

export type EventTranslationWriteRequest = z.infer<typeof eventTranslationWriteSchema>;

export const eventNightSchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  label: z.string(),
  venue: z.string().nullable(),
  position: z.number().int(),
});

export type EventNightDto = z.infer<typeof eventNightSchema>;

export const eventCategorySchema = z.object({
  id: z.string().uuid(),
  kind: seatCategoryKindSchema,
  name: z.string(),
  description: z.string().nullable(),
  pricePerSeat: z.number().nullable(),
  currency: z.string(),
  position: z.number().int(),
});

export type EventCategoryDto = z.infer<typeof eventCategorySchema>;

export const eventTranslationSchema = z.object({
  locale: z.string(),
  name: z.string().nullable(),
  place: z.string().nullable(),
  summary: z.string().nullable(),
  notes: z.string().nullable(),
  nights: z.record(
    z.string(),
    z.object({ label: z.string().nullable(), venue: z.string().nullable() }),
  ),
  categories: z.record(
    z.string(),
    z.object({ name: z.string().nullable(), description: z.string().nullable() }),
  ),
  published: z.boolean(),
  /** The source changed after this overlay was last saved. */
  stale: z.boolean(),
  updatedAt: z.string(),
});

export type EventTranslationDto = z.infer<typeof eventTranslationSchema>;

export const eventListItemSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  status: eventStatusSchema,
  access: eventAccessSchema,
  province: z.string(),
  startsOn: z.string(),
  endsOn: z.string(),
  datesConfirmed: z.boolean(),
  name: z.string(),
  requestCount: z.number().int(),
  openRequestCount: z.number().int(),
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
});

export type EventListItemDto = z.infer<typeof eventListItemSchema>;

export const eventSchema = eventListItemSchema.extend({
  confirmBy: z.string().nullable(),
  sourceLocale: z.string(),
  place: z.string(),
  summary: z.string(),
  notes: z.string().nullable(),
  nights: z.array(eventNightSchema),
  categories: z.array(eventCategorySchema),
  translations: z.array(eventTranslationSchema),
  /** Why it cannot be published now; empty when it can. */
  publishIssues: z.array(z.string()),
});

export type EventDto = z.infer<typeof eventSchema>;

/** The storefront's view of an event, in one locale (D1, D2). */
export const publicEventSchema = z.object({
  slug: z.string(),
  access: eventAccessSchema,
  province: z.string(),
  startsOn: z.string(),
  endsOn: z.string(),
  datesConfirmed: z.boolean(),
  confirmBy: z.string().nullable(),
  name: z.string(),
  place: z.string(),
  summary: z.string(),
  notes: z.string().nullable(),
  /** The locale the text is in (the source when no published overlay exists). */
  locale: z.string(),
  nights: z.array(eventNightSchema.omit({ position: true })),
  categories: z.array(eventCategorySchema.omit({ position: true })),
});

export type PublicEventDto = z.infer<typeof publicEventSchema>;

export const publicEventQuerySchema = z.object({
  locale: localeSchema.optional(),
});

export type PublicEventQuery = z.infer<typeof publicEventQuerySchema>;

/**
 * A traveler's seat request (D3–D5). BUILD carries the trip the request
 * derives; EXISTING names exactly one of the traveler's own bookings or open
 * custom requests; TICKETS_ONLY needs neither.
 */
export const createEventRequestSchema = z
  .object({
    eventSlug: z.string().trim().min(1).max(120),
    categoryId: z.string().uuid(),
    nightIds: z.array(z.string().uuid()).max(31).default([]),
    seats: z.number().int().min(1).max(MAX_EVENT_SEATS),
    path: eventRequestPathSchema,
    arrival: dateSchema.optional(),
    totalNights: z.number().int().min(1).max(MAX_EVENT_TRIP_NIGHTS).optional(),
    afterProvince: provinceCode.nullable().optional(),
    reservationId: z.string().uuid().optional(),
    customRequestId: z.string().uuid().optional(),
    notes: z.string().trim().min(1).max(2000).optional(),
    /** Asked only when the account lacks them; stamped on the user (D4). */
    phone: z.string().trim().min(1).max(40).optional(),
    nationality: nationalitySchema.optional(),
    locale: localeSchema.optional(),
  })
  .refine(
    (value) =>
      value.path !== 'BUILD' ||
      (value.arrival !== undefined && value.totalNights !== undefined),
    { message: 'a trip to build needs an arrival and its nights', path: ['arrival'] },
  )
  .refine(
    (value) =>
      value.path !== 'EXISTING' ||
      (value.reservationId === undefined) !== (value.customRequestId === undefined),
    {
      message: 'name one booking or one custom request',
      path: ['reservationId'],
    },
  )
  .refine(
    (value) =>
      value.path === 'EXISTING' ||
      (value.reservationId === undefined && value.customRequestId === undefined),
    { message: 'only an existing trip names a booking', path: ['reservationId'] },
  );

export type CreateEventRequestRequest = z.infer<typeof createEventRequestSchema>;

export const createEventRequestResultSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  /** The derived M5 request for BUILD and TICKETS_ONLY. */
  customRequestReference: z.string().nullable(),
});

export type CreateEventRequestResultDto = z.infer<typeof createEventRequestResultSchema>;

/** What the traveler may attach seats to (D5 EXISTING). */
export const eventLinkTargetsSchema = z.object({
  bookings: z.array(
    z.object({
      id: z.string().uuid(),
      bookingCode: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      status: z.string(),
    }),
  ),
  customRequests: z.array(
    z.object({
      id: z.string().uuid(),
      reference: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export type EventLinkTargetsDto = z.infer<typeof eventLinkTargetsSchema>;

const requestEventSummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  startsOn: z.string(),
  endsOn: z.string(),
  datesConfirmed: z.boolean(),
  confirmBy: z.string().nullable(),
});

/** A request as its traveler sees it. */
export const myEventRequestSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  status: eventRequestStatusSchema,
  path: eventRequestPathSchema,
  event: requestEventSummarySchema,
  categoryName: z.string(),
  categoryKind: seatCategoryKindSchema,
  nights: z.array(z.object({ date: z.string(), label: z.string() })),
  seats: z.number().int(),
  tickets: z.number().int(),
  bookingCode: z.string().nullable(),
  reservationId: z.string().uuid().nullable(),
  customRequestReference: z.string().nullable(),
  /** Frozen at confirmation; null before. */
  pricePerSeat: z.number().nullable(),
  feePerSeat: z.number().nullable(),
  total: z.number().nullable(),
  currency: z.string(),
  closedReason: z.string().nullable(),
  createdAt: z.string(),
  confirmedAt: z.string().nullable(),
});

export type MyEventRequestDto = z.infer<typeof myEventRequestSchema>;

export const eventRequestListQuerySchema = z.object({
  status: eventRequestStatusSchema.optional(),
  eventId: z.string().uuid().optional(),
  reservationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type EventRequestListQuery = z.infer<typeof eventRequestListQuerySchema>;

export const eventRequestListItemSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  status: eventRequestStatusSchema,
  /** SUBMITTED past the answer threshold (D7). */
  overdue: z.boolean(),
  path: eventRequestPathSchema,
  event: requestEventSummarySchema,
  travelerName: z.string().nullable(),
  travelerEmail: z.string(),
  categoryName: z.string(),
  categoryKind: seatCategoryKindSchema,
  seats: z.number().int(),
  tickets: z.number().int(),
  reservationId: z.string().uuid().nullable(),
  bookingCode: z.string().nullable(),
  customRequestId: z.string().uuid().nullable(),
  customRequestReference: z.string().nullable(),
  createdAt: z.string(),
});

export type EventRequestListItemDto = z.infer<typeof eventRequestListItemSchema>;

export const eventRequestDetailSchema = eventRequestListItemSchema.extend({
  travelerId: z.string().uuid(),
  nights: z.array(
    z.object({ date: z.string(), label: z.string(), venue: z.string().nullable() }),
  ),
  notes: z.string().nullable(),
  locale: z.string().nullable(),
  indicativePricePerSeat: z.number().nullable(),
  feePerSeatDefault: z.number(),
  pricePerSeat: z.number().nullable(),
  feePerSeat: z.number().nullable(),
  total: z.number().nullable(),
  currency: z.string(),
  closedReason: z.string().nullable(),
  answeredAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  /** The linked booking's price is locked: confirming adds a ticket instalment (D6). */
  priceLocked: z.boolean().nullable(),
  /** The traveler's bookings the desk may confirm onto when none is linked. */
  linkableBookings: eventLinkTargetsSchema.shape.bookings,
});

export type EventRequestDetailDto = z.infer<typeof eventRequestDetailSchema>;

export const eventRequestReasonSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export type EventRequestReasonRequest = z.infer<typeof eventRequestReasonSchema>;

/** Confirming freezes the seat price paid and puts the tickets on a booking (D6). */
export const confirmEventRequestSchema = z.object({
  pricePerSeat: money,
  /** Needed only when the request has no booking yet; one of the traveler's own. */
  reservationId: z.string().uuid().optional(),
});

export type ConfirmEventRequestRequest = z.infer<typeof confirmEventRequestSchema>;

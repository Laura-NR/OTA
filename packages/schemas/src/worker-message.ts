import { WORKER_MESSAGE_MAX_LENGTH } from '@ota/domain';
import { z } from 'zod';

import { serviceTypeSchema } from './dispatch';
import { supplierCategorySchema } from './supplier';

/**
 * Worker ↔ desk messages (`docs/schema-w-messages.md`, approved M1–M8): a
 * worker's one thread with the desk, never a traveler's.
 */

export const workerMessageSenderSchema = z.enum(['WORKER', 'OPERATIONS']);

export type WorkerMessageSenderName = z.infer<typeof workerMessageSenderSchema>;

/** One message in a worker's thread, as the worker and the desk read it. */
export const workerMessageSchema = z.object({
  id: z.string().uuid(),
  sender: workerMessageSenderSchema,
  body: z.string(),
  /** The desk person's first name on the desk's messages (M7); null on the worker's. */
  authorName: z.string().nullable(),
  /** The job it is about, when it names one (M2). */
  serviceItemId: z.string().uuid().nullable(),
  /** That job's booking code, for the line under the message. */
  bookingCode: z.string().nullable(),
  /** The phone's time of writing, on the worker's messages (M4). */
  writtenAt: z.string().nullable(),
  createdAt: z.string(),
  /** When the receiving side opened the thread (M3). */
  readAt: z.string().nullable(),
  /** The app's id, so the app can drop the copy it kept while sending. */
  clientRef: z.string().nullable(),
});

export type WorkerMessageDto = z.infer<typeof workerMessageSchema>;

const body = z.string().trim().min(1).max(WORKER_MESSAGE_MAX_LENGTH);

/** A message the worker wrote, sent from the phone's queue (M4). */
export const sendWorkerMessageSchema = z.object({
  body,
  /** The app's id for the message, so a resent one is kept once. */
  clientRef: z.string().uuid(),
  /** The job it is about, when written from W-Job. */
  serviceItemId: z.string().uuid().nullable().optional(),
  /** When it was written, ISO 8601: the phone's time corrected by the API's clock. */
  writtenAt: z.string().datetime({ offset: true }),
});

export type SendWorkerMessageRequest = z.infer<typeof sendWorkerMessageSchema>;

/** A message the desk writes to a worker; from a booking it names that booking's service. */
export const deskWorkerMessageSchema = z.object({
  body,
  serviceItemId: z.string().uuid().nullable().optional(),
});

export type DeskWorkerMessageRequest = z.infer<typeof deskWorkerMessageSchema>;

/** The worker's thread (W-Job's "Central · hoy", the Messages screen). */
export const workerThreadSchema = z.object({
  messages: z.array(workerMessageSchema),
  /** The desk's messages the worker has not opened. */
  unread: z.number().int().nonnegative(),
});

export type WorkerThreadDto = z.infer<typeof workerThreadSchema>;

/** A worker's thread as the desk opens it (the supplier page, the booking, AL-Inbox). */
export const deskWorkerThreadSchema = z.object({
  supplierId: z.string().uuid(),
  workerName: z.string(),
  category: supplierCategorySchema,
  phone: z.string(),
  messages: z.array(workerMessageSchema),
});

export type DeskWorkerThreadDto = z.infer<typeof deskWorkerThreadSchema>;

/** What a "read" call marked. */
export const workerMessagesReadSchema = z.object({
  read: z.number().int().nonnegative(),
});

export type WorkerMessagesReadDto = z.infer<typeof workerMessagesReadSchema>;

/** The job a worker's thread line shows: their current or next one (AL-Inbox). */
export const workerThreadJobSchema = z.object({
  serviceItemId: z.string().uuid(),
  reservationId: z.string().uuid(),
  bookingCode: z.string(),
  serviceType: serviceTypeSchema,
  province: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
});

export type WorkerThreadJobDto = z.infer<typeof workerThreadJobSchema>;

/** The latest message of a thread, for a list line. */
export const workerThreadLastSchema = z.object({
  body: z.string(),
  sender: workerMessageSenderSchema,
  createdAt: z.string(),
});

/** A worker on a booking with their latest message about it (A-Booking's "Worker threads"). */
export const bookingWorkerThreadSchema = z.object({
  supplierId: z.string().uuid(),
  workerName: z.string(),
  category: supplierCategorySchema,
  phone: z.string(),
  /** The booking's services this worker holds, for the reply to name. */
  serviceItemIds: z.array(z.string().uuid()),
  /** Their latest message about this booking; null when there is none. */
  lastMessage: workerThreadLastSchema.nullable(),
  /** Their messages about this booking nobody on the desk has opened. */
  unread: z.number().int().nonnegative(),
});

export type BookingWorkerThreadDto = z.infer<typeof bookingWorkerThreadSchema>;

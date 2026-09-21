import { z } from 'zod';

export const messageSenderSchema = z.enum(['TRAVELER', 'OPERATIONS']);

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export type SendMessageRequest = z.infer<typeof sendMessageSchema>;

export const messageSchema = z.object({
  id: z.string().uuid(),
  reservationId: z.string().uuid(),
  sender: messageSenderSchema,
  body: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export type MessageDto = z.infer<typeof messageSchema>;

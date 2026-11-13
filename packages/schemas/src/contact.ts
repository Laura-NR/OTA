import { z } from 'zod';

/** The Support form's topics (Support board), in the order the form lists them. */
export const contactTopicSchema = z.enum([
  'planning',
  'booking',
  'payment',
  'entry',
  'accessibility',
  'partners',
  'complaint',
  'other',
]);

/** A message from the public Support form. Consent is required to process it. */
export const contactMessageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  topic: contactTopicSchema,
  bookingCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{4,16}$/)
    .optional(),
  message: z.string().trim().min(10).max(4000),
  replyLocale: z.enum(['en', 'es', 'fr']),
  consent: z.literal(true),
});

export type ContactTopic = z.infer<typeof contactTopicSchema>;
export type ContactMessageRequest = z.infer<typeof contactMessageSchema>;

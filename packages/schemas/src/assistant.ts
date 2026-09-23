import { z } from 'zod';

/** AI assistant surfaces (spec §4.8). */

export const draftReplyRequestSchema = z.object({
  reservationId: z.string().uuid(),
});

export type DraftReplyRequest = z.infer<typeof draftReplyRequestSchema>;

export const draftReplySchema = z.object({
  subject: z.string(),
  body: z.string(),
});

export type DraftReplyDto = z.infer<typeof draftReplySchema>;

export const assistantSummarySchema = z.object({
  text: z.string(),
});

export type AssistantSummaryDto = z.infer<typeof assistantSummarySchema>;

export const translateRequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  targetLocale: z.string().trim().min(2).max(5),
});

export type TranslateRequest = z.infer<typeof translateRequestSchema>;

export const translationSchema = z.object({
  text: z.string(),
  targetLocale: z.string(),
});

export type TranslationDto = z.infer<typeof translationSchema>;

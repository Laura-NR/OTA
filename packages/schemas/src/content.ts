import { z } from 'zod';

/**
 * The shape of a tenant's page content (`tenant/messages/<locale>.json` →
 * `content`): the agency's own words for its content pages, kept out of the
 * core catalogs (AGENTS.md: agency material lives in `tenant/`). Text is plain;
 * there is no markup. In-house tables replace these files when A-Content lands
 * (design plan Q8).
 */

/** `placeholder` pages show a sample-content notice until the agency publishes them. */
export const contentStatusSchema = z.enum(['placeholder', 'published']);

const text = z.string().min(1);

export const contentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text }),
  z.object({
    type: z.literal('list'),
    title: text.optional(),
    items: z.array(text).min(1),
    ordered: z.boolean().optional(),
  }),
  /** A term with its explanation: "Runs: lights, fans…", a glossary, a team list. */
  z.object({
    type: z.literal('definitions'),
    title: text.optional(),
    items: z.array(z.object({ term: text, text })).min(1),
  }),
  z.object({
    type: z.literal('steps'),
    items: z.array(z.object({ title: text, when: text.optional(), text })).min(1),
  }),
  z.object({
    type: z.literal('table'),
    caption: text.optional(),
    head: z.array(text).min(1),
    rows: z.array(z.array(z.string())).min(1),
  }),
  z.object({ type: z.literal('quote'), text, cite: text.optional() }),
  z.object({ type: z.literal('callout'), title: text.optional(), text }),
  /** An image slot; photography is still to come, so it renders as a captioned placeholder. */
  z.object({ type: z.literal('photo'), alt: text, caption: text.optional() }),
]);

export const contentSectionSchema = z.object({
  /** Anchor for "On this page". */
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: text,
  eyebrow: text.optional(),
  lede: text.optional(),
  /** Provenance, e.g. "Last verified 20 Sep 2026 · reviewed monthly". */
  note: text.optional(),
  blocks: z.array(contentBlockSchema),
});

export const contentPageSchema = z.object({
  status: contentStatusSchema,
  eyebrow: text.optional(),
  title: text,
  lede: text.optional(),
  note: text.optional(),
  sections: z.array(contentSectionSchema),
});

export const faqItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  question: text,
  answer: text,
  details: text.optional(),
  reviewed: text.optional(),
});

/** Channel descriptions; a channel shows only when the manifest sets its contact. */
export const supportContentSchema = contentPageSchema.extend({
  channels: z.object({
    whatsapp: z.object({ title: text, text }),
    email: z.object({ title: text, text }),
    phone: z.object({ title: text, text }),
    account: z.object({ title: text, text }),
  }),
  emergency: z.object({ title: text, text }),
  faq: z.object({ title: text, lede: text.optional(), items: z.array(faqItemSchema) }),
});

export const articleSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  category: text,
  title: text,
  standfirst: text,
  author: text,
  authorRole: text.optional(),
  readingMinutes: z.number().int().positive(),
  published: text,
  updated: text.optional(),
  photo: z.object({ alt: text, caption: text.optional() }).optional(),
  sections: z.array(contentSectionSchema).min(1),
});

export const blogContentSchema = z.object({
  status: contentStatusSchema,
  eyebrow: text.optional(),
  title: text,
  lede: text.optional(),
  articles: z.array(articleSchema),
});

export const footerContentSchema = z.object({ tagline: text });

export type ContentStatus = z.infer<typeof contentStatusSchema>;
export type ContentBlock = z.infer<typeof contentBlockSchema>;
export type ContentSection = z.infer<typeof contentSectionSchema>;
export type ContentPage = z.infer<typeof contentPageSchema>;
export type FaqItem = z.infer<typeof faqItemSchema>;
export type SupportContent = z.infer<typeof supportContentSchema>;
export type Article = z.infer<typeof articleSchema>;
export type BlogContent = z.infer<typeof blogContentSchema>;
export type FooterContent = z.infer<typeof footerContentSchema>;

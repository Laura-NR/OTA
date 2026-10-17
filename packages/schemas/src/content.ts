import { CONSENT_PURPOSES } from '@ota/domain';
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

/** An overline and a display heading: the head of every Home section. */
const sectionHeadSchema = z.object({ eyebrow: text.optional(), title: text });

/**
 * The agency's words on Home (Home / M-Home boards). Trips, destinations and
 * guides come from their own sources; this holds only the copy around them.
 */
export const homeContentSchema = z.object({
  status: contentStatusSchema,
  hero: sectionHeadSchema.extend({
    lede: text,
    /** The checked promises under the search; each must be true of every booking. */
    promises: z.array(text).max(3),
    photo: z.object({ alt: text }),
  }),
  /** "How booking works"; the link goes to About. */
  steps: sectionHeadSchema.extend({
    link: text.optional(),
    items: z
      .array(z.object({ title: text, text }))
      .min(1)
      .max(4),
  }),
  featured: sectionHeadSchema,
  /** "Where our hosts are": the first destinations of the tenant's destination data. */
  destinations: sectionHeadSchema.optional(),
  /** "Why Vereda": figures on tinted tiles, then plain points; the link goes to About. */
  why: sectionHeadSchema.extend({
    stats: z
      .array(
        z.object({
          value: text,
          text,
          tone: z.enum(['secondary', 'primary', 'accent', 'neutral']),
        }),
      )
      .max(4),
    points: z.array(text),
    link: text.optional(),
  }),
  /** The custom-itinerary band; shown only when the builder is enabled. */
  custom: sectionHeadSchema.extend({ text, cta: text, note: text.optional() }),
  guides: sectionHeadSchema,
});

export const conditionTopicSchema = z.enum([
  'power',
  'fuel',
  'connectivity',
  'advisories',
  'weather',
  'roads',
]);

/** `ok` reads green, `caution` amber, `info` blue (DS 03 pills). */
export const conditionToneSchema = z.enum(['ok', 'caution', 'info']);

/**
 * "Cuba right now": the strip above the header on the trip-planning pages and
 * Home's briefing card. Ops will publish it from A-Content (M7); until then it
 * is tenant content, and a placeholder says so wherever it shows.
 */
export const conditionsContentSchema = z.object({
  status: contentStatusSchema,
  strip: z.object({ headline: text, text }),
  eyebrow: text.optional(),
  title: text,
  updated: text,
  items: z
    .array(
      z.object({
        topic: conditionTopicSchema,
        label: text,
        value: text,
        tone: conditionToneSchema,
      }),
    )
    .min(1),
  note: text.optional(),
});

/** The event strip above Home's header (spec §3.2's promotional banner). */
export const eventBannerContentSchema = z.object({
  status: contentStatusSchema,
  label: text,
  headline: text,
  text,
  cta: text,
});

/** A destination card's words; its numbers are in the tenant's destinations.json. */
export const destinationCardSchema = z.object({
  name: text,
  tagline: text,
  /** The photo's intended alt text, until photography exists. */
  alt: text,
  /** The backup-power pill: "Battery casas", "Generators · fuel: plan ahead". */
  power: text,
  /** What there is to sleep in: "9 casas, 2 farm stays". */
  stays: text,
});

const factSchema = z.object({ label: text, value: text, note: text.optional() });

/**
 * A destination page's own words (Destination board). Every section is
 * optional: a destination without them still shows its network, conditions,
 * experiences, stays and trips from data.
 */
export const destinationDetailSchema = z.object({
  lede: text.optional(),
  photo: z.object({ alt: text }).optional(),
  /** "2 h 30 by road", after the distance in the overline. */
  travelTime: text.optional(),
  /** "Best: Nov – Apr · dry, 22–28 °C". */
  best: text.optional(),
  overview: z
    .object({
      title: text,
      paragraphs: z.array(text).min(1),
      tags: z.array(text).default([]),
      facts: z.array(factSchema).default([]),
    })
    .optional(),
  conditions: z
    .object({
      title: text,
      updated: text.optional(),
      items: z
        .array(
          z.object({
            topic: conditionTopicSchema,
            label: text,
            text,
            status: text,
            tone: conditionToneSchema,
          }),
        )
        .min(1),
      plan: z.object({ title: text, items: z.array(text).min(1) }).optional(),
    })
    .optional(),
  experiences: sectionHeadSchema.optional(),
  packages: sectionHeadSchema.optional(),
  stays: sectionHeadSchema.extend({ note: text.optional() }).optional(),
  gettingThere: z
    .object({
      title: text,
      eyebrow: text.optional(),
      head: z.array(text).min(2),
      rows: z.array(z.array(z.string())).min(1),
      note: text.optional(),
    })
    .optional(),
  faq: z.object({ title: text, items: z.array(faqItemSchema).min(1) }).optional(),
});

/** Destinations and Destination: the words around the tenant's destination data. */
export const destinationsContentSchema = z.object({
  status: contentStatusSchema,
  eyebrow: text.optional(),
  title: text,
  lede: text.optional(),
  /** Theme filter labels, keyed as destinations.json's `theme`. */
  themes: z.record(z.string(), text),
  /** One line per province for the map panel, keyed by province code. */
  provinces: z.record(z.string(), z.object({ summary: text })).default({}),
  /** Keyed by destination slug; a destination without words is not shown. */
  items: z.record(z.string(), destinationCardSchema),
  details: z.record(z.string(), destinationDetailSchema).default({}),
});

/** The agency's words on Packages and Compare; the trips are the live catalogue. */
export const packagesContentSchema = z.object({
  status: contentStatusSchema,
  title: text,
  lede: text.optional(),
  /** "Not quite right?": the custom-itinerary card after the results. */
  custom: z.object({ eyebrow: text.optional(), text, cta: text }).optional(),
  /** "Still torn?": the closing card on Compare. */
  compare: z.object({ eyebrow: text.optional(), text }).optional(),
});

/**
 * The recruitment page's words (Join board; written for Cuban guides, drivers
 * and hosts, Spanish first). The form itself is core.
 */
export const joinContentSchema = z.object({
  status: contentStatusSchema,
  eyebrow: text.optional(),
  title: text,
  lede: text,
  /** The hero's call to the form. */
  cta: text,
  promises: z.array(text).max(3),
  /** Figures on the hero; the board's are samples until the agency reports its own. */
  stats: z.array(z.object({ value: text, text })).max(4),
  steps: sectionHeadSchema.extend({
    items: z.array(z.object({ title: text, text })).min(1),
  }),
  asks: z.object({ title: text, items: z.array(text).min(1) }),
  gets: z.object({ title: text, items: z.array(text).min(1) }),
  faq: z.object({ title: text, items: z.array(faqItemSchema).min(1) }).optional(),
});

/**
 * A text a traveler agrees to, with the version id stamped on what they sign
 * or consent to (M3, D4). Change the version whenever the words change, so a
 * consent given to the old words is asked for again.
 */
export const legalTextSchema = z.object({ version: z.string().min(1).max(100), text });

/** The agency's legal statements: the OFAC certification and each consent's words. */
export const legalContentSchema = z.object({
  status: contentStatusSchema,
  ofacStatement: legalTextSchema.optional(),
  consents: z.partialRecord(z.enum(CONSENT_PURPOSES), legalTextSchema).default({}),
});

export type ContentStatus = z.infer<typeof contentStatusSchema>;
export type ContentBlock = z.infer<typeof contentBlockSchema>;
export type ContentSection = z.infer<typeof contentSectionSchema>;
export type ContentPage = z.infer<typeof contentPageSchema>;
export type FaqItem = z.infer<typeof faqItemSchema>;
export type SupportContent = z.infer<typeof supportContentSchema>;
export type Article = z.infer<typeof articleSchema>;
export type BlogContent = z.infer<typeof blogContentSchema>;
export type FooterContent = z.infer<typeof footerContentSchema>;
export type HomeContent = z.infer<typeof homeContentSchema>;
export type ConditionTopic = z.infer<typeof conditionTopicSchema>;
export type ConditionTone = z.infer<typeof conditionToneSchema>;
export type ConditionsContent = z.infer<typeof conditionsContentSchema>;
export type EventBannerContent = z.infer<typeof eventBannerContentSchema>;
export type DestinationCard = z.infer<typeof destinationCardSchema>;
export type DestinationDetail = z.infer<typeof destinationDetailSchema>;
export type LegalText = z.infer<typeof legalTextSchema>;
export type LegalContent = z.infer<typeof legalContentSchema>;
export type DestinationsContent = z.infer<typeof destinationsContentSchema>;
export type PackagesContent = z.infer<typeof packagesContentSchema>;
export type JoinContent = z.infer<typeof joinContentSchema>;

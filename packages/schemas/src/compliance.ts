import { CONSENT_PURPOSES, OFAC_CATEGORIES } from '@ota/domain';
import { z } from 'zod';

/**
 * M3 compliance DTOs (`docs/schema-m3-compliance.md`). Lists carry an
 * affidavit's status, category and dates; the signature, IP address and user
 * agent come only from the audited record route.
 */

export const ofacCategorySchema = z.enum(OFAC_CATEGORIES);

export type OfacCategoryDto = z.infer<typeof ofacCategorySchema>;

export const affidavitSourceSchema = z.enum(['ONLINE', 'PAPER']);

export const affidavitSummarySchema = z.object({
  id: z.string().uuid(),
  travelerId: z.string().uuid().nullable(),
  category: ofacCategorySchema,
  signerName: z.string(),
  source: affidavitSourceSchema,
  signedAt: z.string(),
  statementVersion: z.string(),
  /** A scanned paper form is on file. */
  hasDocument: z.boolean(),
});

export type AffidavitSummaryDto = z.infer<typeof affidavitSummarySchema>;

/** One traveler's OFAC position on a booking. */
export const travelerOfacSchema = z.object({
  travelerId: z.string().uuid(),
  fullName: z.string(),
  /** A US person must certify (the desk's override, else a US nationality). */
  required: z.boolean(),
  /** The current (latest) affidavit, or null. */
  affidavit: affidavitSummarySchema.nullable(),
});

export type TravelerOfacDto = z.infer<typeof travelerOfacSchema>;

export const reservationOfacSchema = z.object({
  reservationId: z.string().uuid(),
  /** US persons still without an affidavit; any blocks payment links and vouchers. */
  missing: z.number().int(),
  travelers: z.array(travelerOfacSchema),
  /** The statement a traveler signs online (version and words). */
  statement: z.object({ version: z.string(), text: z.string() }).nullable(),
});

export type ReservationOfacDto = z.infer<typeof reservationOfacSchema>;

/** The full record, returned only by the audited route. */
export const affidavitRecordSchema = affidavitSummarySchema.extend({
  reservationId: z.string().uuid().nullable(),
  bookingCode: z.string(),
  signerNationality: z.string().nullable(),
  travelStart: z.string(),
  travelEnd: z.string(),
  statementHash: z.string(),
  signature: z.string(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  recordedByEmail: z.string().nullable(),
  supersedesId: z.string().uuid().nullable(),
  retainUntil: z.string(),
  createdAt: z.string(),
});

export type AffidavitRecordDto = z.infer<typeof affidavitRecordSchema>;

/** A traveler certifies online; the statement version is the one they were shown. */
export const signAffidavitSchema = z.object({
  category: ofacCategorySchema,
  signature: z.string().trim().min(1).max(200),
  statementVersion: z.string().trim().min(1).max(100),
});

export type SignAffidavitRequest = z.infer<typeof signAffidavitSchema>;

/** The desk records a signed paper form with its scan. */
export const recordPaperAffidavitSchema = z.object({
  category: ofacCategorySchema,
  signerName: z.string().trim().min(1).max(200),
  signedAt: z.coerce.date(),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  contentBase64: z.string().min(1),
});

export type RecordPaperAffidavitRequest = z.infer<typeof recordPaperAffidavitSchema>;

export const affidavitExportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type AffidavitExportQuery = z.infer<typeof affidavitExportQuerySchema>;

export const consentPurposeSchema = z.enum(CONSENT_PURPOSES);

export type ConsentPurposeDto = z.infer<typeof consentPurposeSchema>;

export const consentRecordSchema = z.object({
  id: z.string().uuid(),
  purpose: consentPurposeSchema,
  granted: z.boolean(),
  textVersion: z.string(),
  source: z.enum([
    'BOOKING',
    'ACCOUNT',
    'COOKIE_BANNER',
    'PAYMENT',
    'CUSTOM_REQUEST',
    'DESK',
  ]),
  locale: z.string().nullable(),
  region: z.string().nullable(),
  reservationId: z.string().uuid().nullable(),
  createdAt: z.string(),
});

export type ConsentRecordDto = z.infer<typeof consentRecordSchema>;

/** A signed-in traveler's current consent per purpose, with the words in force now. */
export const myConsentSchema = z.object({
  purpose: consentPurposeSchema,
  /** The latest entry, or null when nothing was asked yet. */
  current: consentRecordSchema.nullable(),
  /** The text in force; null when the agency has not written one. */
  text: z.object({ version: z.string(), text: z.string() }).nullable(),
  /** Nothing granted yet, withdrawn, or granted to older words. */
  needsConsent: z.boolean(),
});

export type MyConsentDto = z.infer<typeof myConsentSchema>;

/**
 * A traveler grants or withdraws one consent. `textVersion` is the version
 * they were shown; a stale one is refused so a grant never covers words the
 * traveler did not see.
 */
export const recordConsentSchema = z.object({
  purpose: consentPurposeSchema,
  granted: z.boolean(),
  textVersion: z.string().trim().min(1).max(100),
  source: z.enum(['BOOKING', 'ACCOUNT', 'PAYMENT', 'CUSTOM_REQUEST']).default('ACCOUNT'),
  locale: z.string().trim().min(2).max(5).optional(),
  reservationId: z.string().uuid().optional(),
});

export type RecordConsentRequest = z.infer<typeof recordConsentSchema>;

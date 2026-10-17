import { z } from 'zod';

import { consentPurposeSchema, ofacCategorySchema } from './compliance';
import { nationalitySchema } from './regulatory';
import { passportNumberSchema } from './travelers';

/**
 * The storefront Booking form (Booking board, five steps; M2 party + M3
 * certification and consents) sends one request for the signed-in traveler.
 * It carries choices only: the server reads each traveler's kind from the date
 * of birth, builds the rooms from the set-up, prices the booking, re-checks the
 * departure's places and freezes the price lines. A passport number is stored
 * encrypted and never returned.
 */

/** Consents a booking cannot be sent without (Booking board step 5). */
export const BOOKING_REQUIRED_CONSENTS = [
  'TERMS',
  'PRIVACY_NOTICE',
  'CANCELLATION_POLICY',
  'INSURANCE_ACKNOWLEDGEMENT',
] as const;

/** Consents the form may also record, when the traveler ticks them. */
export const BOOKING_OPTIONAL_CONSENTS = ['TRIP_MESSAGES'] as const;

const bookingConsentPurposes: readonly string[] = [
  ...BOOKING_REQUIRED_CONSENTS,
  ...BOOKING_OPTIONAL_CONSENTS,
];

export const bookingTravelerSchema = z.object({
  /** Names as on the passport. */
  fullName: z.string().trim().min(1).max(200),
  dateOfBirth: z.coerce
    .date()
    .refine((value) => value.getTime() <= Date.now(), 'A date of birth is in the past'),
  nationality: nationalitySchema,
  /** Optional until 30 days before departure (Booking board step 4). */
  passportNumber: passportNumberSchema.optional(),
});

export type BookingTravelerInput = z.infer<typeof bookingTravelerSchema>;

export const bookingExtraSchema = z.object({
  packageExtraId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20).default(1),
});

/** A US traveler's certification, signed by the booking's owner with that traveler's name. */
export const bookingAffidavitSchema = z.object({
  /** Index into `travelers`. */
  traveler: z.number().int().min(0),
  category: ofacCategorySchema,
  signature: z.string().trim().min(1).max(200),
});

export const bookingConsentSchema = z.object({
  purpose: consentPurposeSchema,
  /** The version of the words the traveler was shown. */
  textVersion: z.string().trim().min(1).max(100),
});

export const bookPackageSchema = z
  .object({
    packageId: z.string().uuid(),
    departureId: z.string().uuid(),
    /** Null takes the package's default tier, if it has tiers. */
    tierId: z.string().uuid().nullable().default(null),
    rooming: z.enum(['SHARE', 'PRIVATE']),
    /** Ask the desk to match a roommate and waive the supplement where it can. */
    roommateMatch: z.boolean().default(false),
    /** The first traveler is the lead: the signed-in traveler, who receives the emails. */
    travelers: z.array(bookingTravelerSchema).min(1).max(20),
    /** The lead's mobile, for check-ins during the trip. */
    phone: z.string().trim().min(1).max(40).optional(),
    emergencyContactName: z.string().trim().min(1).max(200).optional(),
    emergencyContactPhone: z.string().trim().min(1).max(40).optional(),
    extras: z.array(bookingExtraSchema).max(20).default([]),
    roomRequests: z.string().trim().max(1000).optional(),
    notes: z.string().trim().max(2000).optional(),
    affidavits: z.array(bookingAffidavitSchema).max(20).default([]),
    /** The OFAC statement version shown; required with any affidavit. */
    statementVersion: z.string().trim().min(1).max(100).optional(),
    consents: z.array(bookingConsentSchema).min(1).max(10),
    /** The language the legal texts were shown in. */
    locale: z.string().trim().min(2).max(5).optional(),
    /** The total the traveler was shown; a different server price is refused (409). */
    expectedTotal: z.coerce.number().nonnegative().optional(),
  })
  .superRefine((booking, context) => {
    const extras = booking.extras.map((extra) => extra.packageExtraId);
    if (new Set(extras).size !== extras.length) {
      context.addIssue({
        code: 'custom',
        message: 'An extra is listed twice',
        path: ['extras'],
      });
    }

    const signed = new Set<number>();
    booking.affidavits.forEach((affidavit, index) => {
      if (affidavit.traveler >= booking.travelers.length) {
        context.addIssue({
          code: 'custom',
          message: 'The certification is for a traveler who is not in the list',
          path: ['affidavits', index, 'traveler'],
        });
      }
      if (signed.has(affidavit.traveler)) {
        context.addIssue({
          code: 'custom',
          message: 'A traveler is certified twice',
          path: ['affidavits', index, 'traveler'],
        });
      }
      signed.add(affidavit.traveler);
    });
    if (booking.affidavits.length > 0 && !booking.statementVersion) {
      context.addIssue({
        code: 'custom',
        message: 'A certification needs the statement version it was signed under',
        path: ['statementVersion'],
      });
    }

    const purposes = booking.consents.map((consent) => consent.purpose);
    if (new Set(purposes).size !== purposes.length) {
      context.addIssue({
        code: 'custom',
        message: 'A consent is listed twice',
        path: ['consents'],
      });
    }
    booking.consents.forEach((consent, index) => {
      if (!bookingConsentPurposes.includes(consent.purpose)) {
        context.addIssue({
          code: 'custom',
          message: `${consent.purpose} is not asked for at booking`,
          path: ['consents', index, 'purpose'],
        });
      }
    });
    for (const purpose of BOOKING_REQUIRED_CONSENTS) {
      if (!purposes.includes(purpose)) {
        context.addIssue({
          code: 'custom',
          message: `The ${purpose} consent is required to send a booking`,
          path: ['consents'],
        });
      }
    }
  });

export type BookPackageRequest = z.infer<typeof bookPackageSchema>;

import { z } from 'zod';

import { serviceTypeSchema } from './dispatch';
import { supplierCategorySchema, verificationStatusSchema } from './supplier';

/**
 * What the worker app may show about the travelers (W-Login: "Solo ves el
 * nombre, el idioma y …"): a first name, the language and the party size.
 * Never an address, an email or a payment.
 */
export const workerTravelerSchema = z.object({
  firstName: z.string().nullable(),
  /** The traveler's locale, such as `en`. */
  language: z.string(),
  partySize: z.number().int(),
});

/** A job as the worker app shows it: one service item of theirs. */
export const workerJobSchema = z.object({
  serviceItemId: z.string().uuid(),
  serviceType: serviceTypeSchema,
  province: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  bookingCode: z.string(),
  /** The worker's payout in the base currency, as a decimal string. */
  payout: z.string(),
  currency: z.string(),
  traveler: workerTravelerSchema,
});

export type WorkerJobDto = z.infer<typeof workerJobSchema>;

/** An open offer (W-Offer): the job plus its answer window. */
export const workerOfferSchema = workerJobSchema.extend({
  offeredAt: z.string(),
  deadline: z.string(),
  /** When less than a quarter of the window is left, by default (the desk's amber). */
  hurryFrom: z.string(),
});

export type WorkerOfferDto = z.infer<typeof workerOfferSchema>;

/** W-Home: the worker, their open offers and their coming jobs. */
export const workerHomeSchema = z.object({
  worker: z.object({
    firstName: z.string().nullable(),
    category: supplierCategorySchema,
    provinces: z.array(z.string()),
    verificationStatus: verificationStatusSchema,
    credentialExpiresAt: z.string().nullable(),
    /** Accepted over answered offers, 0–100; null before five answers. */
    reliability: z.number().int().nullable(),
  }),
  offers: z.array(workerOfferSchema),
  jobs: z.array(workerJobSchema),
  /** The API's clock, so the app counts down without trusting the phone's. */
  serverTime: z.string(),
});

export type WorkerHomeDto = z.infer<typeof workerHomeSchema>;

/** A sign-in code the desk issued to read out to a worker (W1). */
export const workerSignInCodeSchema = z.object({
  code: z.string(),
  expiresAt: z.string(),
  /** The number the worker types, with two digits hidden. */
  phone: z.string(),
});

export type WorkerSignInCodeDto = z.infer<typeof workerSignInCodeSchema>;

/** What the desk's "Sign out of the worker app" ended. */
export const workerSignOutSchema = z.object({
  /** The phones that were signed in as this worker and now are not. */
  sessions: z.number().int(),
});

export type WorkerSignOutDto = z.infer<typeof workerSignOutSchema>;
